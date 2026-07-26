import type { CategorySystemKey } from "@/lib/types";

/**
 * Data awal yang wajib ada agar sebuah akun bisa dipakai sejak menit pertama.
 *
 * Ini BUKAN data contoh: daftar kategori dan konfigurasi ingestion memang bagian
 * dari produk. Setiap user baru mendapat salinannya sendiri (lihat
 * `provisionNewUser` di `repositories.ts`) supaya bisa diubah tanpa memengaruhi
 * user lain.
 */

interface SeedCategory {
  name: string;
  kind: "expense" | "income";
  sortOrder: number;
  isSystem?: boolean;
  systemKey?: CategorySystemKey;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: "Makanan & Minuman", kind: "expense", sortOrder: 1 },
  { name: "Transport", kind: "expense", sortOrder: 2 },
  { name: "Belanja", kind: "expense", sortOrder: 3 },
  { name: "Tagihan & Utilitas", kind: "expense", sortOrder: 4 },
  { name: "Hiburan", kind: "expense", sortOrder: 5 },
  { name: "Kesehatan", kind: "expense", sortOrder: 6 },
  { name: "Pendidikan", kind: "expense", sortOrder: 7 },
  // Dipakai otomatis untuk tarik tunai; tidak boleh dihapus user.
  {
    name: "Cash Expense",
    kind: "expense",
    sortOrder: 8,
    isSystem: true,
    systemKey: "cash_expense",
  },
  // Dipakai otomatis untuk uang yang diberikan ke kolaborator. Sejak aplikasi
  // multi-tenant, transfer ke pasangan bukan lagi "transfer internal" melainkan
  // pengeluaran sungguhan — kategori ini yang menampungnya.
  {
    name: "Kolaborasi Keluar",
    kind: "expense",
    sortOrder: 9,
    isSystem: true,
    systemKey: "collaboration_out",
  },
  { name: "Lainnya", kind: "expense", sortOrder: 10 },

  { name: "Gaji", kind: "income", sortOrder: 1 },
  { name: "Transfer Masuk", kind: "income", sortOrder: 2 },
  { name: "Refund", kind: "income", sortOrder: 3 },
  // Dana yang diterima dari kolaborator. Tetap dihitung sebagai pemasukan, tapi
  // berkategori sendiri supaya bisa disaring keluar saat user ingin melihat
  // penghasilannya sendiri tanpa uang kiriman.
  {
    name: "Dana Kolaborasi",
    kind: "income",
    sortOrder: 4,
    isSystem: true,
    systemKey: "collaboration_in",
  },
  { name: "Lainnya", kind: "income", sortOrder: 5 },
];

export const SEED_SOURCE_HEALTH = [
  {
    source: "bca",
    emailSupported: null,
    note: "Belum diverifikasi — teruskan satu email transaksi untuk mengecek.",
  },
  { source: "blu_bca", emailSupported: null, note: "Belum diverifikasi." },
  { source: "seabank", emailSupported: null, note: "Belum diverifikasi." },
  {
    source: "gopay",
    emailSupported: null,
    note: "Belum diverifikasi — e-wallet sering hanya kirim notifikasi push.",
  },
  {
    source: "shopeepay",
    emailSupported: null,
    note: "Belum diverifikasi — e-wallet sering hanya kirim notifikasi push.",
  },
  {
    source: "ovo",
    emailSupported: null,
    note: "Belum diverifikasi — e-wallet sering hanya kirim notifikasi push.",
  },
  {
    source: "dana",
    emailSupported: null,
    note: "Belum diverifikasi — e-wallet sering hanya kirim notifikasi push.",
  },
] as const;
