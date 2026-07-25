/**
 * Menjalankan satu putaran penarikan email secara manual.
 *
 * Jalankan: `npm run poll`
 *
 * Dipakai untuk uji coba dan sebagai jalur cadangan. Penjadwalan berkalanya
 * nanti memanggil fungsi yang sama (`pollGmailOnce`), jadi apa yang diuji di
 * sini persis dengan yang berjalan otomatis.
 */
import { pollGmailOnce } from "../src/lib/ingestion/poll-gmail";

async function main() {
  const result = await pollGmailOnce();

  if (result.skipped) {
    console.log(`Dilewati: ${result.skipped}`);
    return;
  }

  console.log(`Email dipindai   : ${result.scanned}`);
  console.log(`Transaksi baru   : ${result.inserted}`);
  console.log(`Duplikat dilewati: ${result.duplicates}`);
  console.log(`Bukan transaksi  : ${result.nonTransaction}`);

  if (result.errors.length > 0) {
    console.log(`\n${result.errors.length} email gagal diproses:`);
    for (const e of result.errors) {
      console.log(`  ${e.messageId}: ${e.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Gagal menjalankan polling:", error);
    process.exit(1);
  });
