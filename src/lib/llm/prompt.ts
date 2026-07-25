import { EXTRACTION_JSON_SHAPE } from "./schema";

/**
 * Prompt ekstraksi email transaksi.
 *
 * Beberapa instruksi di sini ada karena kegagalan nyata yang mahal, bukan
 * sekadar kerapian:
 *
 * - **Zona waktu dipaku ke WIB.** Email bank Indonesia menulis jam lokal tanpa
 *   menyebut zonanya. Kalau ini diserahkan ke tebakan model, transaksi jelang
 *   tengah malam bisa tercatat di tanggal — bahkan bulan — yang salah, dan
 *   ringkasan bulanan ikut meleset.
 * - **Nominal harus integer rupiah.** "Rp1.500.000,00" mudah disalahbaca jadi
 *   1500 atau 1500000.00. Diminta eksplisit agar koma desimal dibuang dan titik
 *   ribuan tidak diperlakukan sebagai desimal.
 * - **Arah ditentukan dari sudut pandang pemilik rekening**, bukan dari kata
 *   "kredit"/"debit" yang artinya terbalik antar bank.
 * - **confidence: "low" wajib** saat ada yang meragukan. Nilai ini yang
 *   menentukan sebuah transaksi masuk antrean review, jadi model diminta
 *   berhati-hati alih-alih menebak dengan percaya diri.
 */
export const EXTRACTION_SYSTEM_PROMPT = `Anda adalah pengurai email notifikasi transaksi bank dan e-wallet Indonesia.

Tugas: baca isi email, keluarkan HANYA satu objek JSON dengan bentuk persis:
${EXTRACTION_JSON_SHAPE}

Aturan:

1. isTransactionEmail
   - true hanya jika email ini benar-benar memberitahukan sebuah transaksi yang SUDAH terjadi.
   - false untuk promosi, penawaran, kode OTP, peringatan login, tagihan yang belum dibayar, ringkasan bulanan, atau email verifikasi.
   - Jika false, isi seluruh field lain dengan null dan confidence "low".

2. direction — dari sudut pandang pemilik rekening:
   - "in"  = saldo pemilik BERTAMBAH (transfer masuk, gaji, refund, cashback).
   - "out" = saldo pemilik BERKURANG (transfer keluar, pembayaran, QRIS, tarik tunai, top up e-wallet).
   - Jangan berpatokan pada kata "kredit"/"debit" — maknanya berbeda antar bank.

3. amount
   - Bilangan bulat rupiah penuh, tanpa titik/koma. "Rp1.500.000,00" -> 1500000.
   - Titik adalah pemisah ribuan, koma adalah desimal. Buang bagian desimalnya.
   - Selalu positif; arah uang sudah diwakili field direction.

4. occurredAt
   - Waktu transaksi menurut email, format ISO 8601 dengan offset +07:00.
   - Email bank Indonesia menulis waktu lokal TANPA menyebut zonanya. Anggap SELALU WIB (+07:00), kecuali email menyebut zona lain secara eksplisit.
   - Contoh: "25/07/2026 14:30" -> "2026-07-25T14:30:00+07:00".
   - Jika hanya ada tanggal tanpa jam, pakai "T00:00:00+07:00".
   - Jika tidak ada informasi waktu sama sekali, null.

5. counterpartyName / counterpartyAccountNumber
   - Nama dan nomor rekening pihak lawan, apa adanya seperti tertulis di email.
   - Pertahankan penyamaran bank apa adanya (mis. "ANNISA P*****") — jangan menebak melengkapi.
   - Jika nomor rekening tidak disebut, null. Jangan mengarang.

6. rawTransactionType
   - Salin label jenis transaksi dari bank apa adanya, mis. "TARIK TUNAI ATM", "QRIS DEBIT", "TRANSFER KELUAR".

7. confidence
   - "high" hanya jika nominal DAN arah keduanya tersurat jelas.
   - "low" jika ada yang ambigu, format emailnya tidak dikenali, atau Anda menebak salah satu field.

Keluarkan JSON saja. Tanpa penjelasan, tanpa blok kode.`;

export function buildExtractionUserPrompt({
  sourceLabel,
  senderAddress,
  subject,
  body,
}: {
  sourceLabel: string;
  senderAddress: string;
  subject: string;
  body: string;
}): string {
  // Isi email dipotong: notifikasi bank menaruh informasi transaksi di awal,
  // sisanya footer legal yang panjang dan hanya menambah biaya token.
  const trimmed = body.slice(0, 4000);

  return `Sumber: ${sourceLabel}
Pengirim: ${senderAddress}
Subjek: ${subject}

Isi email:
"""
${trimmed}
"""`;
}

/** Pesan koreksi saat balasan pertama tidak lolos validasi skema. */
export function buildRepairPrompt(errorMessage: string): string {
  return `Balasan Anda sebelumnya tidak sesuai skema. Kesalahan: ${errorMessage}

Keluarkan ulang JSON yang benar sesuai bentuk yang diminta. JSON saja.`;
}
