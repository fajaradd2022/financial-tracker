/**
 * Membuat ENCRYPTION_KEY baru. Jalankan: `npm run gen:key`
 *
 * Kuncinya mengenkripsi refresh token Gmail di database. Kalau kunci ini hilang
 * atau diganti, token yang sudah tersimpan tidak bisa dibaca lagi dan setiap
 * user harus menghubungkan Gmail-nya ulang — jadi simpan bersama backup.
 */
import { generateEncryptionKey } from "../src/lib/crypto";

console.log("Tambahkan baris ini ke .env:\n");
console.log(`ENCRYPTION_KEY=${generateEncryptionKey()}`);
console.log(
  "\nSimpan bersama backup database. Kunci hilang = semua koneksi Gmail harus dihubungkan ulang.",
);
