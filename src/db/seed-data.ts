/**
 * Data awal yang wajib ada agar aplikasi bisa dipakai sejak menit pertama.
 *
 * Ini BUKAN data dummy: daftar kategori dan konfigurasi ingestion memang bagian
 * dari produk. Rekening dan transaksi contoh dipisah ke `demoTransactions`
 * supaya bisa dilewati saat dipasang sungguhan.
 */

export const SEED_CATEGORIES = [
  { name: "Makanan & Minuman", kind: "expense", sortOrder: 1 },
  { name: "Transport", kind: "expense", sortOrder: 2 },
  { name: "Belanja", kind: "expense", sortOrder: 3 },
  { name: "Tagihan & Utilitas", kind: "expense", sortOrder: 4 },
  { name: "Hiburan", kind: "expense", sortOrder: 5 },
  { name: "Kesehatan", kind: "expense", sortOrder: 6 },
  { name: "Pendidikan", kind: "expense", sortOrder: 7 },
  // Dipakai otomatis untuk tarik tunai; tidak boleh dihapus user.
  { name: "Cash Expense", kind: "expense", sortOrder: 8, isSystem: true },
  { name: "Lainnya", kind: "expense", sortOrder: 9 },
  { name: "Gaji", kind: "income", sortOrder: 1 },
  { name: "Transfer Masuk", kind: "income", sortOrder: 2 },
  { name: "Refund", kind: "income", sortOrder: 3 },
  { name: "Lainnya", kind: "income", sortOrder: 4 },
] as const;

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

export const SEED_INGESTION_CONFIG = {
  inboxEmail: "ganti-dengan-inbox-khusus@gmail.com",
  pollIntervalMinutes: 12,
  backfillEnabled: false,
  enabled: false, // dimatikan sampai kredensial Gmail benar-benar terpasang
} as const;
