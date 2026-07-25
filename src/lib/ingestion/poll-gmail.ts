import * as repo from "@/db/repositories";
import { getMessage, hasGmailCredentials, listMessages } from "@/lib/gmail/client";
import { knownSenderQuery } from "@/lib/gmail/source-mapping";
import { hasOpenRouterKey } from "@/lib/llm/openrouter";
import {
  ingestMessage,
  readSyncCursor,
  writeSyncCursor,
  type IngestDeps,
} from "./pipeline";

/**
 * Satu putaran penarikan email.
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
 *    (ditangkis unique constraint `gmail_message_id`), sedangkan melewatkan
 *    email berarti transaksi hilang tanpa jejak.
 */

export interface PollResult {
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

// Kunci di memori proses: mencegah dua putaran tumpang tindih kalau satu
// putaran berjalan lebih lama daripada intervalnya.
let running = false;

export async function pollGmailOnce(
  deps: IngestDeps = {},
): Promise<PollResult> {
  const empty: PollResult = {
    scanned: 0,
    inserted: 0,
    duplicates: 0,
    nonTransaction: 0,
    errors: [],
  };

  if (running) return { ...empty, skipped: "Putaran sebelumnya masih berjalan." };

  const config = await repo.getIngestionConfig();
  if (!config.enabled) {
    return { ...empty, skipped: "Ingestion dimatikan di Pengaturan." };
  }
  if (!hasGmailCredentials()) {
    return { ...empty, skipped: "Kredensial Gmail belum diisi (.env)." };
  }
  if (!hasOpenRouterKey()) {
    return { ...empty, skipped: "OPENROUTER_API_KEY belum diisi (.env)." };
  }

  running = true;
  const startedAt = new Date().toISOString();

  try {
    const cursor = await readSyncCursor();
    const since =
      cursor ??
      new Date(
        Date.now() - FIRST_RUN_LOOKBACK_MINUTES * 60_000,
      ).toISOString();

    // Sedikit tumpang tindih disengaja: email bisa tiba di inbox beberapa detik
    // setelah waktu kirimnya, dan duplikat lebih murah daripada email terlewat.
    const overlapped = new Date(new Date(since).getTime() - 120_000).toISOString();
    const query = `after:${toGmailAfter(overlapped)} (${knownSenderQuery()})`;

    const summaries = await listMessages(query, 100);
    const result: PollResult = { ...empty, scanned: summaries.length };

    for (const summary of summaries) {
      try {
        const message = await getMessage(summary.id);
        const outcome = await ingestMessage(message, deps);
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
    await writeSyncCursor(startedAt);
    await repo.updateIngestionConfig({ lastPolledAt: startedAt });

    return result;
  } finally {
    running = false;
  }
}
