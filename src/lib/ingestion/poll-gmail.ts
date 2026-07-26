import * as repo from "@/db/repositories";
import { decryptSecret, hasEncryptionKey } from "@/lib/crypto";
import {
  getMessage,
  hasOAuthAppCredentials,
  listMessages,
  type GmailSession,
} from "@/lib/gmail/client";
import { knownSenderQuery } from "@/lib/gmail/source-mapping";
import { hasOpenRouterKey } from "@/lib/llm/openrouter";
import { ingestMessage, SYNC_CURSOR_KEY, type IngestDeps } from "./pipeline";

/**
 * Satu putaran penarikan email untuk SATU user.
 *
 * Dua keputusan yang menentukan keandalannya:
 *
 * 1. **Kursor waktu, bukan historyId.** Gmail menyediakan historyId yang lebih
 *    hemat, tapi ia kedaluwarsa kalau tidak dipakai beberapa hari dan
 *    penanganannya berbelit. Pada volume keuangan pribadi dengan jeda 12 menit,
 *    kueri `after:` jauh lebih sederhana dan mudah dinalar.
 *
 * 2. **Kursor hanya dimajukan setelah seluruh batch selesai.** Kalau proses
 *    mati di tengah, jendela yang sama akan ditarik ulang. Memproses ulang aman
 *    (ditangkis unique constraint `(user_id, gmail_message_id)`), sedangkan
 *    melewatkan email berarti transaksi hilang tanpa jejak.
 */

export interface PollResult {
  userId: string;
  skipped?: string;
  scanned: number;
  inserted: number;
  duplicates: number;
  nonTransaction: number;
  errors: { messageId: string; message: string }[];
}

/** Jendela mundur saat pertama kali dijalankan — tanpa backfill histori. */
const FIRST_RUN_LOOKBACK_MINUTES = 30;

/** Gmail `after:` memakai epoch detik. */
function toGmailAfter(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

// Kunci per user: mencegah dua putaran user yang sama tumpang tindih kalau satu
// putaran berjalan lebih lama daripada intervalnya. Per user, bukan global,
// supaya inbox user lain tidak ikut tertahan.
const running = new Set<string>();

export async function pollGmailOnce(
  userId: string,
  deps: IngestDeps = {},
): Promise<PollResult> {
  const empty: PollResult = {
    userId,
    scanned: 0,
    inserted: 0,
    duplicates: 0,
    nonTransaction: 0,
    errors: [],
  };

  if (running.has(userId)) {
    return { ...empty, skipped: "Putaran sebelumnya masih berjalan." };
  }

  const config = await repo.getIngestionConfig(userId);
  if (!config.enabled) {
    return { ...empty, skipped: "Ingestion dimatikan di Pengaturan." };
  }
  if (!hasOAuthAppCredentials()) {
    return {
      ...empty,
      skipped: "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET belum diisi (.env).",
    };
  }
  if (!hasEncryptionKey()) {
    return { ...empty, skipped: "ENCRYPTION_KEY belum diisi (.env)." };
  }
  if (!hasOpenRouterKey()) {
    return { ...empty, skipped: "OPENROUTER_API_KEY belum diisi (.env)." };
  }

  const encrypted = await repo.getGmailRefreshTokenEncrypted(userId);
  if (!encrypted) {
    return { ...empty, skipped: "Gmail belum dihubungkan untuk akun ini." };
  }

  let session: GmailSession;
  try {
    session = { userId, refreshToken: decryptSecret(encrypted) };
  } catch (error) {
    // Kunci enkripsi berubah atau data rusak — dicatat supaya muncul sebagai
    // peringatan "perlu hubungkan ulang", bukan gagal diam-diam tiap 12 menit.
    const message = error instanceof Error ? error.message : String(error);
    await repo.recordGmailError(userId, message);
    return { ...empty, skipped: message };
  }

  running.add(userId);
  const startedAt = new Date().toISOString();

  try {
    const cursor = await repo.readSyncCursor(userId, SYNC_CURSOR_KEY);
    const since =
      cursor ??
      new Date(Date.now() - FIRST_RUN_LOOKBACK_MINUTES * 60_000).toISOString();

    // Sedikit tumpang tindih disengaja: email bisa tiba di inbox beberapa detik
    // setelah waktu kirimnya, dan duplikat lebih murah daripada email terlewat.
    const overlapped = new Date(
      new Date(since).getTime() - 120_000,
    ).toISOString();
    const query = `after:${toGmailAfter(overlapped)} (${knownSenderQuery()})`;

    const summaries = await listMessages(session, query, 100);
    const result: PollResult = { ...empty, scanned: summaries.length };

    for (const summary of summaries) {
      try {
        const message = await getMessage(session, summary.id);
        const outcome = await ingestMessage(userId, message, deps);
        if (outcome.status === "inserted") result.inserted += 1;
        else if (outcome.status === "skipped_duplicate") result.duplicates += 1;
        else result.nonTransaction += 1;
      } catch (error) {
        // Satu email bermasalah tidak boleh menggagalkan seluruh putaran —
        // sisanya tetap harus diproses.
        result.errors.push({
          messageId: summary.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Kursor baru dimajukan di sini: sesudah semua pesan batch ini ditangani.
    await repo.writeSyncCursor(userId, SYNC_CURSOR_KEY, startedAt);
    await repo.updateIngestionConfig(userId, { lastPolledAt: startedAt });

    return result;
  } finally {
    running.delete(userId);
  }
}

/** Apakah user ini sudah waktunya ditarik lagi menurut intervalnya sendiri. */
async function isDue(userId: string): Promise<boolean> {
  const config = await repo.getIngestionConfig(userId);
  if (!config.lastPolledAt) return true;
  const elapsedMinutes =
    (Date.now() - new Date(config.lastPolledAt).getTime()) / 60_000;
  return elapsedMinutes >= config.pollIntervalMinutes;
}

/**
 * Menjalankan satu putaran untuk semua user yang ingestion-nya menyala DAN
 * sudah waktunya ditarik.
 *
 * Penjadwal berdetak lebih sering daripada interval user mana pun; penyaringan
 * "sudah waktunya belum" ada di sini supaya tiap user benar-benar mengikuti
 * `pollIntervalMinutes` miliknya sendiri, bukan irama penjadwal.
 */
export async function pollAllUsers(
  deps: IngestDeps = {},
): Promise<PollResult[]> {
  const userIds = await repo.listUsersWithIngestionEnabled();
  const results: PollResult[] = [];

  // Berurutan, bukan paralel: SQLite hanya mengizinkan satu penulis, dan
  // menarik beberapa inbox sekaligus tidak mempercepat apa pun di skala ini.
  for (const userId of userIds) {
    if (!(await isDue(userId))) continue;
    results.push(await pollGmailOnce(userId, deps));
  }
  return results;
}
