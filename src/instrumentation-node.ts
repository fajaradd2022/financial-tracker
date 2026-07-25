import * as repo from "./db/repositories";
import { pollGmailOnce } from "./lib/ingestion/poll-gmail";

/**
 * Penjadwal polling email — khusus runtime Node.js.
 *
 * Berkas ini terpisah dari `instrumentation.ts` bukan demi kerapian: Next.js
 * menjalankan `register()` di runtime Node MAUPUN Edge, dan bundler tetap
 * menelusuri isi dynamic import meski dijaga percabangan runtime. Karena modul
 * ini menarik `better-sqlite3` (modul native yang tidak ada di Edge),
 * menaruhnya di berkas sendiri adalah satu-satunya cara agar bundle Edge tidak
 * ikut mencoba mengompilasinya.
 *
 * Penjadwalnya memakai `setTimeout` berantai, bukan pustaka cron: yang
 * dibutuhkan hanya "jalankan tiap N menit", dan interval dibaca ulang setiap
 * putaran sehingga perubahan di halaman Pengaturan langsung berlaku tanpa
 * perlu me-restart server.
 *
 * CATATAN DEPLOY: jalankan pm2 dalam mode `fork` dengan satu instance. Mode
 * cluster akan menjalankan penjadwal ini di setiap worker, sehingga inbox
 * ditarik berkali-kali secara bersamaan.
 */

const DEFAULT_INTERVAL_MINUTES = 12;

let timer: NodeJS.Timeout | null = null;

async function tick() {
  try {
    const result = await pollGmailOnce();
    if (!result.skipped && result.inserted > 0) {
      console.log(
        `[ingestion] ${result.inserted} transaksi baru dari ${result.scanned} email.`,
      );
    }
    if (result.errors?.length) {
      console.warn(`[ingestion] ${result.errors.length} email gagal diproses.`);
    }
  } catch (error) {
    // Penjadwal tidak boleh mati karena satu putaran gagal — kalau ia berhenti,
    // ingestion diam-diam mati sampai server di-restart.
    console.error("[ingestion] putaran gagal:", error);
  } finally {
    await schedule();
  }
}

async function schedule() {
  if (timer) clearTimeout(timer);

  let minutes = DEFAULT_INTERVAL_MINUTES;
  try {
    const config = await repo.getIngestionConfig();
    minutes = Math.max(1, config.pollIntervalMinutes);
  } catch {
    // Database belum siap (mis. migrasi belum dijalankan) — pakai default dan
    // coba lagi pada putaran berikutnya.
  }

  timer = setTimeout(() => void tick(), minutes * 60_000);
  // Timer tidak boleh menahan proses tetap hidup saat aplikasi hendak keluar.
  timer.unref?.();
}

export async function startIngestionScheduler() {
  await schedule();
  console.log("[ingestion] penjadwal polling aktif.");
}
