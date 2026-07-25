import type { TransactionSource } from "@/lib/types";

/**
 * Memetakan alamat pengirim email ke sumber transaksi.
 *
 * Pencocokan memakai potongan domain, bukan alamat lengkap, karena satu bank
 * kerap mengirim dari beberapa alamat berbeda (`notifikasi@`, `no-reply@`,
 * `alert@`) di domain yang sama.
 *
 * CATATAN: daftar ini masih tebakan berdasarkan domain resmi masing-masing
 * penyedia dan BELUM diverifikasi dengan email sungguhan. Langkah pertama
 * Fase 1 adalah meneruskan satu email asli per sumber, lalu memperbaiki
 * daftar ini sesuai alamat pengirim yang benar-benar dipakai.
 */
const DOMAIN_PATTERNS: { pattern: string; source: TransactionSource }[] = [
  { pattern: "blubybcadigital.co.id", source: "blu_bca" },
  { pattern: "blubybca", source: "blu_bca" },
  // Dicek setelah blu: keduanya mengandung "bca", dan pola yang lebih spesifik
  // harus menang lebih dulu.
  { pattern: "bca.co.id", source: "bca" },
  { pattern: "klikbca", source: "bca" },
  { pattern: "seabank.co.id", source: "seabank" },
  { pattern: "seabank", source: "seabank" },
  { pattern: "shopee.co.id", source: "shopeepay" },
  { pattern: "shopeepay", source: "shopeepay" },
  { pattern: "ovo.id", source: "ovo" },
  { pattern: "dana.id", source: "dana" },
  { pattern: "gojek.com", source: "gopay" },
  { pattern: "gopay.co.id", source: "gopay" },
];

/**
 * @returns sumber yang cocok, atau null kalau pengirimnya tidak dikenali.
 * Pemanggil harus memutuskan sendiri apa yang dilakukan pada email tak dikenal —
 * membuangnya diam-diam berisiko menghilangkan transaksi.
 */
export function resolveSource(
  senderAddress: string,
): TransactionSource | null {
  const address = senderAddress.toLowerCase();
  for (const { pattern, source } of DOMAIN_PATTERNS) {
    if (address.includes(pattern)) return source;
  }
  return null;
}

/** Kueri Gmail untuk membatasi email yang ditarik ke pengirim yang dikenali. */
export function knownSenderQuery(): string {
  const domains = [...new Set(DOMAIN_PATTERNS.map((d) => d.pattern))];
  return domains.map((d) => `from:${d}`).join(" OR ");
}
