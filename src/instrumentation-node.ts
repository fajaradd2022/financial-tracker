import { pollAllUsers } from "./lib/ingestion/poll-gmail";

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
 * Sejak aplikasi multi-tenant, satu tick menarik inbox SEMUA user yang
 * ingestion-nya menyala, berurutan.
 *
 * CATATAN DEPLOY: jalankan pm2 dalam mode `fork` dengan satu instance. Mode
 * cluster akan menjalankan penjadwal ini di setiap worker, sehingga inbox
 * ditarik berkali-kali secara bersamaan.
 */

/**
 * Interval tetap di tingkat penjadwal. Setelan `pollIntervalMinutes` per user
 * dipakai sebagai batas "sudah waktunya belum" di dalam putaran — penjadwalnya
 * sendiri harus berdetak lebih sering daripada interval user tercepat.
 */
const TICK_MINUTES = 1;

let timer: NodeJS.Timeout | null = null;

async function tick() {
  try {
    const results = await pollAllUsers();
    for (const r of results) {
      if (r.skipped) continue;
      if (r.inserted > 0) {
        console.log(
          `[ingestion] user ${r.userId}: ${r.inserted} transaksi baru dari ${r.scanned} email.`,
        );
        // Tarik tunai yang baru masuk mengubah saldo dompet — dicek di sini,
        // saat datanya baru saja berubah, bukan lewat pemindaian terpisah.
        const { notifyNegativeCashBalance } = await import(
          "./lib/wa-agent/notify"
        );
        await notifyNegativeCashBalance(r.userId).catch((error) =>
          console.error("[whatsapp] notifikasi gagal:", error),
        );
      }
      if (r.errors.length > 0) {
        console.warn(
          `[ingestion] user ${r.userId}: ${r.errors.length} email gagal diproses.`,
        );
      }
    }
  } catch (error) {
    // Penjadwal tidak boleh mati karena satu putaran gagal — kalau ia berhenti,
    // ingestion diam-diam mati sampai server di-restart.
    console.error("[ingestion] putaran gagal:", error);
  } finally {
    schedule();
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void tick(), TICK_MINUTES * 60_000);
  // Timer tidak boleh menahan proses tetap hidup saat aplikasi hendak keluar.
  timer.unref?.();
}

export function startIngestionScheduler() {
  schedule();
  console.log("[ingestion] penjadwal polling aktif.");
}
