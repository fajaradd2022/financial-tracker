/**
 * Menjalankan satu putaran penarikan email untuk semua user, secara manual.
 *
 * Jalankan: `npm run poll`
 *
 * Dipakai untuk uji coba dan sebagai jalur cadangan. Penjadwalan berkalanya
 * memanggil fungsi yang sama (`pollAllUsers`), jadi apa yang diuji di sini
 * persis dengan yang berjalan otomatis.
 */
import { pollAllUsers } from "../src/lib/ingestion/poll-gmail";

async function main() {
  const results = await pollAllUsers();

  if (results.length === 0) {
    console.log("Tidak ada user yang ingestion-nya aktif & sudah waktunya.");
    return;
  }

  for (const result of results) {
    console.log(`\nUser ${result.userId}`);
    if (result.skipped) {
      console.log(`  Dilewati: ${result.skipped}`);
      continue;
    }
    console.log(`  Email dipindai   : ${result.scanned}`);
    console.log(`  Transaksi baru   : ${result.inserted}`);
    console.log(`  Duplikat dilewati: ${result.duplicates}`);
    console.log(`  Bukan transaksi  : ${result.nonTransaction}`);

    for (const e of result.errors) {
      console.log(`  ! ${e.messageId}: ${e.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Gagal menjalankan polling:", error);
    process.exit(1);
  });
