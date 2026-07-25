/**
 * Dipanggil Next.js sekali saat server boot, di runtime Node.js MAUPUN Edge.
 *
 * Isinya sengaja hanya percabangan runtime: kode penjadwalnya tinggal di
 * `instrumentation-node.ts` karena bundler tetap menelusuri isi dynamic import
 * meski dijaga percabangan, dan modul itu menarik `better-sqlite3` yang tidak
 * ada di runtime Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Saat `next build`, modul ini ikut dievaluasi untuk pengumpulan halaman.
  // Tanpa penjaga ini, proses build menjadwalkan polling yang tidak dibutuhkan.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startIngestionScheduler } = await import("./instrumentation-node");
  await startIngestionScheduler();
}
