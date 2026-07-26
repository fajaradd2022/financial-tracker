import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Enkripsi simetris untuk rahasia yang harus disimpan di database.
 *
 * Dipakai untuk refresh token Gmail: token itu memberi akses baca ke inbox
 * seseorang, jadi menyimpannya sebagai teks polos berarti siapa pun yang bisa
 * membaca berkas database — termasuk dari salinan backup yang tercecer — bisa
 * membaca email mereka.
 *
 * ## Pilihan algoritma
 *
 * AES-256-GCM, bukan AES-CBC. GCM menyertakan tag autentikasi, sehingga
 * ciphertext yang diubah orang akan DITOLAK saat didekripsi, bukan
 * menghasilkan sampah yang diam-diam dipakai. Untuk data yang dipakai
 * memanggil API pihak ketiga, itu perbedaan yang penting.
 *
 * ## Format tersimpan
 *
 * `v1.<iv-base64>.<tag-base64>.<ciphertext-base64>`
 *
 * Awalan versi ada supaya kalau formatnya harus berubah nanti, data lama masih
 * bisa dikenali dan dimigrasikan alih-alih gagal tanpa penjelasan.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12; // 96 bit — panjang yang direkomendasikan untuk GCM
const KEY_LENGTH = 32; // AES-256

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

export function hasEncryptionKey(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}

/**
 * Membaca kunci dari env. Menerima hex 64 karakter atau base64 32 byte.
 *
 * Sengaja melempar dengan pesan yang menjelaskan cara membuatnya — kunci yang
 * salah panjang adalah kesalahan konfigurasi yang paling mungkin terjadi, dan
 * pesan "invalid key length" dari Node tidak membantu siapa pun.
 */
function readKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionError(
      "ENCRYPTION_KEY belum diisi di .env. Buat dengan: npm run gen:key",
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw.trim())
    ? Buffer.from(raw.trim(), "hex")
    : Buffer.from(raw.trim(), "base64");

  if (key.length !== KEY_LENGTH) {
    throw new EncryptionError(
      `ENCRYPTION_KEY harus 32 byte (hex 64 karakter atau base64). Panjang saat ini: ${key.length} byte. Buat yang benar dengan: npm run gen:key`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = readKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(stored: string): string {
  const key = readKey();
  const parts = stored.split(".");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new EncryptionError(
      "Format data terenkripsi tidak dikenali. Kemungkinan datanya rusak atau dibuat versi lain.",
    );
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Kegagalan di sini hampir selalu berarti salah satu dari dua hal, dan
    // keduanya perlu tindakan manusia — bukan sesuatu yang bisa dipulihkan
    // sendiri oleh aplikasi.
    throw new EncryptionError(
      "Gagal mendekripsi. Kemungkinan ENCRYPTION_KEY berbeda dari saat data disimpan, atau datanya sudah diubah.",
    );
  }
}

/**
 * Perbandingan string rahasia yang waktunya tidak bergantung isi.
 *
 * Perbandingan `===` biasa berhenti di karakter pertama yang berbeda, sehingga
 * lama eksekusinya membocorkan berapa banyak karakter awal yang sudah benar.
 * Dipakai untuk shared secret seperti CRON_SECRET.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual menuntut panjang sama; membandingkan panjang lebih dulu
  // memang membocorkan panjangnya, tapi itu jauh kurang berguna bagi penyerang
  // dibanding membocorkan isinya.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Membuat kunci baru — dipakai `npm run gen:key`. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}
