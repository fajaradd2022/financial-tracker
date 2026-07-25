import type {
  CashWalletEntry,
  Category,
  IngestionConfig,
  OwnAccount,
  SourceHealth,
  Transaction,
  WhatsAppNumber,
} from "./types";

/**
 * Data dummy untuk membangun & mendemokan frontend sebelum backend ada.
 *
 * Semua tanggal ditulis eksplisit (bukan relatif terhadap `new Date()`) supaya
 * render di server dan di browser selalu identik — tanggal relatif akan memicu
 * hydration mismatch dan membuat angka ringkasan berubah tiap reload.
 *
 * Tanggal acuan dataset ini: 26 Juli 2026.
 */

export const OWNER_NAMES = {
  husband: "FAJAR ADITYA",
  wife: "ANNISA PUTRI",
} as const;

export const DUMMY_CATEGORIES: Category[] = [
  // Pengeluaran
  { id: "cat-exp-food", name: "Makanan & Minuman", kind: "expense", isSystem: false, isActive: true, sortOrder: 1 },
  { id: "cat-exp-transport", name: "Transport", kind: "expense", isSystem: false, isActive: true, sortOrder: 2 },
  { id: "cat-exp-shopping", name: "Belanja", kind: "expense", isSystem: false, isActive: true, sortOrder: 3 },
  { id: "cat-exp-bills", name: "Tagihan & Utilitas", kind: "expense", isSystem: false, isActive: true, sortOrder: 4 },
  { id: "cat-exp-fun", name: "Hiburan", kind: "expense", isSystem: false, isActive: true, sortOrder: 5 },
  { id: "cat-exp-health", name: "Kesehatan", kind: "expense", isSystem: false, isActive: true, sortOrder: 6 },
  { id: "cat-exp-edu", name: "Pendidikan", kind: "expense", isSystem: false, isActive: true, sortOrder: 7 },
  { id: "cat-exp-cash", name: "Cash Expense", kind: "expense", isSystem: true, isActive: true, sortOrder: 8 },
  { id: "cat-exp-other", name: "Lainnya", kind: "expense", isSystem: false, isActive: true, sortOrder: 9 },
  // Pemasukan
  { id: "cat-inc-salary", name: "Gaji", kind: "income", isSystem: false, isActive: true, sortOrder: 1 },
  { id: "cat-inc-transfer", name: "Transfer Masuk", kind: "income", isSystem: false, isActive: true, sortOrder: 2 },
  { id: "cat-inc-refund", name: "Refund", kind: "income", isSystem: false, isActive: true, sortOrder: 3 },
  { id: "cat-inc-other", name: "Lainnya", kind: "income", isSystem: false, isActive: true, sortOrder: 4 },
];

export const DUMMY_OWN_ACCOUNTS: OwnAccount[] = [
  { id: "acc-01", owner: "husband", bank: "bca", accountNumberOrIdentifier: "1234567890", label: "BCA Utama", isActive: true },
  { id: "acc-02", owner: "wife", bank: "bca", accountNumberOrIdentifier: "0987654321", label: "BCA Istri", isActive: true },
  { id: "acc-03", owner: "husband", bank: "blu_bca", accountNumberOrIdentifier: "001234567", label: "Blu Tabungan", isActive: true },
  { id: "acc-04", owner: "husband", bank: "seabank", accountNumberOrIdentifier: "901234567890", label: "SeaBank Bunga", isActive: true },
  { id: "acc-05", owner: "wife", bank: "seabank", accountNumberOrIdentifier: "901299887766", label: "SeaBank Istri", isActive: true },
  { id: "acc-06", owner: "husband", bank: "gopay", accountNumberOrIdentifier: "081234567890", label: "GoPay Suami", isActive: true },
  { id: "acc-07", owner: "husband", bank: "ovo", accountNumberOrIdentifier: "081234567890", label: "OVO Suami", isActive: true },
  { id: "acc-08", owner: "husband", bank: "shopeepay", accountNumberOrIdentifier: "081234567890", label: "ShopeePay Suami", isActive: true },
  { id: "acc-09", owner: "wife", bank: "dana", accountNumberOrIdentifier: "081298765432", label: "DANA Istri", isActive: true },
];

/** Field inti yang wajib ditulis; sisanya punya default di `tx()`. */
type TxSeed = Pick<
  Transaction,
  | "id"
  | "source"
  | "direction"
  | "amount"
  | "occurredAt"
  | "counterpartyName"
  | "counterpartyAccountNumber"
  | "rawTransactionType"
> &
  Partial<Transaction>;

let seq = 0;
function tx(seed: TxSeed): Transaction {
  seq += 1;
  return {
    origin: "email",
    gmailMessageId: `msg-${String(seq).padStart(4, "0")}`,
    rawEmailSnippet: null,
    extractionConfidence: "high",
    categoryId: null,
    isInternalTransfer: false,
    internalTransferMatchType: null,
    needsReview: false,
    reviewReason: null,
    ...seed,
  };
}

export const DUMMY_TRANSACTIONS: Transaction[] = [
  // ---- Pemasukan ----
  tx({
    id: "tx-001", source: "bca", direction: "in", amount: 18_500_000,
    occurredAt: "2026-07-25T02:14:00.000Z",
    counterpartyName: "PT TEKNOLOGI NUSANTARA", counterpartyAccountNumber: "5550001111",
    rawTransactionType: "TRANSFER MASUK - PAYROLL", categoryId: "cat-inc-salary",
    rawEmailSnippet: "Telah terjadi transaksi kredit sebesar Rp18.500.000,00 pada rekening 1234567890...",
  }),
  tx({
    id: "tx-002", source: "bca", direction: "in", amount: 18_500_000,
    occurredAt: "2026-06-25T02:11:00.000Z",
    counterpartyName: "PT TEKNOLOGI NUSANTARA", counterpartyAccountNumber: "5550001111",
    rawTransactionType: "TRANSFER MASUK - PAYROLL", categoryId: "cat-inc-salary",
  }),
  tx({
    id: "tx-003", source: "bca", direction: "in", amount: 249_000,
    occurredAt: "2026-07-11T08:32:00.000Z",
    counterpartyName: "TOKOPEDIA REFUND", counterpartyAccountNumber: null,
    rawTransactionType: "TRANSFER MASUK", categoryId: "cat-inc-refund",
  }),
  tx({
    id: "tx-004", source: "bca", direction: "in", amount: 750_000,
    occurredAt: "2026-07-19T11:05:00.000Z",
    counterpartyName: "BUDI HARTONO", counterpartyAccountNumber: "3331114444",
    rawTransactionType: "TRANSFER MASUK", categoryId: "cat-inc-transfer",
  }),

  // ---- Transfer internal (tidak dihitung sebagai pengeluaran) ----
  tx({
    id: "tx-005", source: "bca", direction: "out", amount: 5_000_000,
    occurredAt: "2026-07-25T03:20:00.000Z",
    counterpartyName: "ANNISA PUTRI", counterpartyAccountNumber: "0987654321",
    rawTransactionType: "TRANSFER KELUAR",
    isInternalTransfer: true, internalTransferMatchType: "account_number",
    rawEmailSnippet: "Transfer ke 0987654321 a.n ANNISA PUTRI sebesar Rp5.000.000,00 berhasil...",
  }),
  tx({
    id: "tx-006", source: "bca", direction: "out", amount: 3_000_000,
    occurredAt: "2026-07-14T09:41:00.000Z",
    counterpartyName: "FAJAR ADITYA", counterpartyAccountNumber: "901234567890",
    rawTransactionType: "TRANSFER KELUAR - SEABANK",
    isInternalTransfer: true, internalTransferMatchType: "account_number",
  }),
  tx({
    id: "tx-007", source: "bca", direction: "out", amount: 2_000_000,
    occurredAt: "2026-07-22T13:02:00.000Z",
    counterpartyName: "FAJAR ADITYA", counterpartyAccountNumber: "001234567",
    rawTransactionType: "TRANSFER KELUAR - BLU",
    isInternalTransfer: true, internalTransferMatchType: "account_number",
  }),
  tx({
    id: "tx-008", source: "bca", direction: "out", amount: 500_000,
    occurredAt: "2026-07-20T04:55:00.000Z",
    counterpartyName: "GOPAY 081234567890", counterpartyAccountNumber: "081234567890",
    rawTransactionType: "TOP UP E-WALLET",
    isInternalTransfer: true, internalTransferMatchType: "account_number",
  }),
  tx({
    id: "tx-009", source: "bca", direction: "out", amount: 200_000,
    occurredAt: "2026-07-05T07:18:00.000Z",
    counterpartyName: "OVO 081234567890", counterpartyAccountNumber: "081234567890",
    rawTransactionType: "TOP UP E-WALLET",
    isInternalTransfer: true, internalTransferMatchType: "account_number",
  }),
  // Cocok lewat nama saja (nomor rekening disamarkan bank) -> perlu direview
  tx({
    id: "tx-010", source: "seabank", direction: "out", amount: 1_200_000,
    occurredAt: "2026-07-08T06:47:00.000Z",
    counterpartyName: "ANNISA P*****", counterpartyAccountNumber: null,
    rawTransactionType: "TRANSFER KELUAR",
    isInternalTransfer: true, internalTransferMatchType: "fuzzy_name",
    needsReview: true, reviewReason: "fuzzy_internal_match",
    rawEmailSnippet: "Transfer sebesar Rp1.200.000 ke ANNISA P***** berhasil diproses...",
  }),

  // ---- Tarik tunai (mengisi saldo dompet tunai) ----
  tx({
    id: "tx-011", source: "bca", direction: "out", amount: 1_500_000,
    occurredAt: "2026-07-24T10:12:00.000Z",
    counterpartyName: "ATM BCA MALL KELAPA GADING", counterpartyAccountNumber: null,
    rawTransactionType: "TARIK TUNAI ATM", categoryId: "cat-exp-cash",
    rawEmailSnippet: "Tarik tunai Rp1.500.000,00 di ATM BCA MALL KELAPA GADING...",
  }),
  tx({
    id: "tx-012", source: "bca", direction: "out", amount: 1_000_000,
    occurredAt: "2026-07-10T12:30:00.000Z",
    counterpartyName: "ATM BCA SUDIRMAN", counterpartyAccountNumber: null,
    rawTransactionType: "TARIK TUNAI ATM", categoryId: "cat-exp-cash",
  }),
  tx({
    id: "tx-013", source: "bca", direction: "out", amount: 500_000,
    occurredAt: "2026-06-30T09:05:00.000Z",
    counterpartyName: "ATM BCA CIBUBUR", counterpartyAccountNumber: null,
    rawTransactionType: "TARIK TUNAI ATM", categoryId: "cat-exp-cash",
  }),

  // ---- Pengeluaran nyata ----
  tx({
    id: "tx-014", source: "bca", direction: "out", amount: 32_000,
    occurredAt: "2026-07-26T01:22:00.000Z",
    counterpartyName: "KOPI KENANGAN GADING", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-food",
  }),
  tx({
    id: "tx-015", source: "gopay", direction: "out", amount: 27_000,
    occurredAt: "2026-07-25T23:40:00.000Z",
    counterpartyName: "GOJEK RIDE", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN GORIDE", categoryId: "cat-exp-transport",
  }),
  tx({
    id: "tx-016", source: "bca", direction: "out", amount: 87_500,
    occurredAt: "2026-07-24T14:18:00.000Z",
    counterpartyName: "ALFAMART CEMPAKA", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-shopping",
  }),
  tx({
    id: "tx-017", source: "bca", direction: "out", amount: 425_000,
    occurredAt: "2026-07-23T03:00:00.000Z",
    counterpartyName: "PLN POSTPAID", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN TAGIHAN", categoryId: "cat-exp-bills",
  }),
  tx({
    id: "tx-018", source: "shopeepay", direction: "out", amount: 189_000,
    occurredAt: "2026-07-23T15:27:00.000Z",
    counterpartyName: "SHOPEE ORDER 240723", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN PESANAN", categoryId: "cat-exp-shopping",
  }),
  tx({
    id: "tx-019", source: "ovo", direction: "out", amount: 186_000,
    occurredAt: "2026-07-22T02:10:00.000Z",
    counterpartyName: "NETFLIX INDONESIA", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN BERLANGGANAN", categoryId: "cat-exp-fun",
  }),
  tx({
    id: "tx-020", source: "bca", direction: "out", amount: 45_000,
    occurredAt: "2026-07-21T05:35:00.000Z",
    counterpartyName: "RM PADANG SEDERHANA", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-food",
  }),
  tx({
    id: "tx-021", source: "bca", direction: "out", amount: 62_300,
    occurredAt: "2026-07-20T11:48:00.000Z",
    counterpartyName: "INDOMARET PONDOK KELAPA", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-shopping",
  }),
  tx({
    id: "tx-022", source: "bca", direction: "out", amount: 385_000,
    occurredAt: "2026-07-19T02:30:00.000Z",
    counterpartyName: "INDIHOME", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN TAGIHAN", categoryId: "cat-exp-bills",
  }),
  tx({
    id: "tx-023", source: "bca", direction: "out", amount: 128_000,
    occurredAt: "2026-07-18T09:12:00.000Z",
    counterpartyName: "APOTEK K24 CIBUBUR", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-health",
  }),
  tx({
    id: "tx-024", source: "gopay", direction: "out", amount: 78_000,
    occurredAt: "2026-07-17T05:02:00.000Z",
    counterpartyName: "GOFOOD - MIE GACOAN", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN GOFOOD", categoryId: "cat-exp-food",
  }),
  tx({
    id: "tx-025", source: "bca", direction: "out", amount: 300_000,
    occurredAt: "2026-07-16T07:44:00.000Z",
    counterpartyName: "SPBU PERTAMINA 34.131", counterpartyAccountNumber: null,
    rawTransactionType: "DEBIT CARD", categoryId: "cat-exp-transport",
  }),
  tx({
    id: "tx-026", source: "bca", direction: "out", amount: 1_250_000,
    occurredAt: "2026-07-15T13:55:00.000Z",
    counterpartyName: "TOKOPEDIA", counterpartyAccountNumber: null,
    rawTransactionType: "VIRTUAL ACCOUNT", categoryId: "cat-exp-shopping",
  }),
  tx({
    id: "tx-027", source: "bca", direction: "out", amount: 68_000,
    occurredAt: "2026-07-14T03:28:00.000Z",
    counterpartyName: "STARBUCKS GRAND INDONESIA", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-food",
  }),
  tx({
    id: "tx-028", source: "bca", direction: "out", amount: 100_000,
    occurredAt: "2026-07-13T12:15:00.000Z",
    counterpartyName: "CINEMA XXI", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-fun",
  }),
  tx({
    id: "tx-029", source: "bca", direction: "out", amount: 150_000,
    occurredAt: "2026-07-12T01:40:00.000Z",
    counterpartyName: "BPJS KESEHATAN", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN TAGIHAN", categoryId: "cat-exp-health",
  }),
  tx({
    id: "tx-030", source: "bca", direction: "out", amount: 1_750_000,
    occurredAt: "2026-07-09T02:05:00.000Z",
    counterpartyName: "SD ISLAM AL AZHAR", counterpartyAccountNumber: "7778889999",
    rawTransactionType: "TRANSFER KELUAR", categoryId: "cat-exp-edu",
  }),
  tx({
    id: "tx-031", source: "bca", direction: "out", amount: 96_000,
    occurredAt: "2026-07-07T06:20:00.000Z",
    counterpartyName: "BAKMI GM", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-food",
  }),
  // Ekstraksi kurang yakin -> tetap masuk ledger, tapi ditandai
  tx({
    id: "tx-032", source: "seabank", direction: "out", amount: 2_400_000,
    occurredAt: "2026-07-06T08:00:00.000Z",
    counterpartyName: "PT SUMBER REJEKI", counterpartyAccountNumber: null,
    rawTransactionType: null, categoryId: "cat-exp-other",
    extractionConfidence: "low", needsReview: true, reviewReason: "low_confidence_extraction",
    rawEmailSnippet: "Notifikasi transaksi SeaBank: Rp2.400.000 ... (format email tidak dikenali)",
  }),
  tx({
    id: "tx-033", source: "ovo", direction: "out", amount: 35_000,
    occurredAt: "2026-07-04T10:30:00.000Z",
    counterpartyName: "GRAB TRANSPORT", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN", categoryId: "cat-exp-transport",
  }),
  tx({
    id: "tx-034", source: "bca", direction: "out", amount: 95_000,
    occurredAt: "2026-07-03T02:50:00.000Z",
    counterpartyName: "PDAM TIRTA", counterpartyAccountNumber: null,
    rawTransactionType: "PEMBAYARAN TAGIHAN", categoryId: "cat-exp-bills",
  }),
  // Belum berkategori -> masuk antrean review
  tx({
    id: "tx-035", source: "bca", direction: "out", amount: 340_000,
    occurredAt: "2026-07-02T07:25:00.000Z",
    counterpartyName: "TOKO JAYA ABADI", counterpartyAccountNumber: "2223334445",
    rawTransactionType: "TRANSFER KELUAR", categoryId: null,
    needsReview: true, reviewReason: "uncategorized",
  }),
  tx({
    id: "tx-036", source: "bca", direction: "out", amount: 145_000,
    occurredAt: "2026-07-01T11:10:00.000Z",
    counterpartyName: "SATE KHAS SENAYAN", counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT", categoryId: "cat-exp-food",
  }),
  tx({
    id: "tx-037", source: "bca", direction: "out", amount: 875_000,
    occurredAt: "2026-06-29T09:35:00.000Z",
    counterpartyName: "SUPERINDO", counterpartyAccountNumber: null,
    rawTransactionType: "DEBIT CARD", categoryId: "cat-exp-shopping",
  }),
];

export const DUMMY_CASH_ENTRIES: CashWalletEntry[] = [
  // Kredit dari tarik tunai — otomatis dibuat pipeline saat email tarik tunai masuk
  { id: "cw-01", entryType: "withdrawal_credit", amount: 1_500_000, transactionId: "tx-011", categoryId: null, note: "ATM BCA Mall Kelapa Gading", occurredAt: "2026-07-24T10:12:00.000Z", origin: "email" },
  { id: "cw-02", entryType: "withdrawal_credit", amount: 1_000_000, transactionId: "tx-012", categoryId: null, note: "ATM BCA Sudirman", occurredAt: "2026-07-10T12:30:00.000Z", origin: "email" },
  { id: "cw-03", entryType: "withdrawal_credit", amount: 500_000, transactionId: "tx-013", categoryId: null, note: "ATM BCA Cibubur", occurredAt: "2026-06-30T09:05:00.000Z", origin: "email" },

  // Debit dari input manual (web/WhatsApp)
  { id: "cw-04", entryType: "manual_expense_debit", amount: 50_000, transactionId: null, categoryId: "cat-exp-transport", note: "Parkir & bensin motor", occurredAt: "2026-07-25T10:00:00.000Z", origin: "manual_wa" },
  { id: "cw-05", entryType: "manual_expense_debit", amount: 25_000, transactionId: null, categoryId: "cat-exp-food", note: "Makan siang warteg", occurredAt: "2026-07-24T05:30:00.000Z", origin: "manual_wa" },
  { id: "cw-06", entryType: "manual_expense_debit", amount: 35_000, transactionId: null, categoryId: "cat-exp-food", note: "Jajan anak", occurredAt: "2026-07-24T09:15:00.000Z", origin: "manual_web" },
  { id: "cw-07", entryType: "manual_expense_debit", amount: 150_000, transactionId: null, categoryId: "cat-exp-other", note: "Tukang kebun", occurredAt: "2026-07-22T04:00:00.000Z", origin: "manual_web" },
  { id: "cw-08", entryType: "manual_expense_debit", amount: 85_000, transactionId: null, categoryId: "cat-exp-shopping", note: "Galon & gas", occurredAt: "2026-07-21T08:20:00.000Z", origin: "manual_wa" },
  { id: "cw-09", entryType: "manual_expense_debit", amount: 100_000, transactionId: null, categoryId: "cat-exp-other", note: "Donasi masjid", occurredAt: "2026-07-18T04:45:00.000Z", origin: "manual_web" },
  { id: "cw-10", entryType: "manual_expense_debit", amount: 20_000, transactionId: null, categoryId: "cat-exp-transport", note: "Ojek pangkalan", occurredAt: "2026-07-17T02:10:00.000Z", origin: "manual_wa" },
  { id: "cw-11", entryType: "manual_expense_debit", amount: 275_000, transactionId: null, categoryId: "cat-exp-shopping", note: "Pasar sayur mingguan", occurredAt: "2026-07-15T00:40:00.000Z", origin: "manual_web" },
  { id: "cw-12", entryType: "manual_expense_debit", amount: 180_000, transactionId: null, categoryId: "cat-exp-transport", note: "Servis motor", occurredAt: "2026-07-12T03:25:00.000Z", origin: "manual_web" },
  { id: "cw-13", entryType: "manual_expense_debit", amount: 240_000, transactionId: null, categoryId: "cat-exp-food", note: "Makan keluarga", occurredAt: "2026-07-11T12:05:00.000Z", origin: "manual_wa" },
  { id: "cw-14", entryType: "manual_expense_debit", amount: 60_000, transactionId: null, categoryId: "cat-exp-other", note: "Potong rambut", occurredAt: "2026-07-05T08:50:00.000Z", origin: "manual_web" },
  { id: "cw-15", entryType: "manual_expense_debit", amount: 210_000, transactionId: null, categoryId: "cat-exp-shopping", note: "Belanja pasar", occurredAt: "2026-07-02T01:15:00.000Z", origin: "manual_web" },
  { id: "cw-16", entryType: "manual_expense_debit", amount: 100_000, transactionId: null, categoryId: "cat-exp-transport", note: "Bensin mobil", occurredAt: "2026-06-30T10:00:00.000Z", origin: "manual_wa" },
];

export const DUMMY_INGESTION_CONFIG: IngestionConfig = {
  inboxEmail: "financetracker.ingest@gmail.com",
  pollIntervalMinutes: 12,
  backfillEnabled: false,
  enabled: true,
  lastPolledAt: "2026-07-26T02:00:00.000Z",
};

export const DUMMY_WA_NUMBERS: WhatsAppNumber[] = [
  { id: "wa-01", phoneE164: "+6281234567890", label: "Suami", isActive: true },
  { id: "wa-02", phoneE164: "+6281298765432", label: "Istri", isActive: true },
];

/**
 * Status verifikasi tiap sumber. Sesuai risiko yang dicatat di PRD: e-wallet
 * di Indonesia banyak yang notifikasinya push-only, jadi belum tentu ada email
 * yang bisa diparsing — ini yang harus divalidasi di awal Fase 1.
 */
export const DUMMY_SOURCE_HEALTH: SourceHealth[] = [
  { source: "bca", emailSupported: true, lastSeenAt: "2026-07-26T01:22:00.000Z", note: "Notifikasi lengkap: nominal, nama, no. rekening." },
  { source: "blu_bca", emailSupported: true, lastSeenAt: "2026-07-22T13:02:00.000Z", note: "Format email konsisten." },
  { source: "seabank", emailSupported: true, lastSeenAt: "2026-07-08T06:47:00.000Z", note: "Nama penerima kadang disamarkan (perlu fallback fuzzy)." },
  { source: "gopay", emailSupported: true, lastSeenAt: "2026-07-25T23:40:00.000Z", note: "Struk email dikirim untuk transaksi GoRide/GoFood." },
  { source: "shopeepay", emailSupported: true, lastSeenAt: "2026-07-23T15:27:00.000Z", note: "Email hanya untuk pesanan, bukan semua transaksi." },
  { source: "ovo", emailSupported: null, lastSeenAt: "2026-07-22T02:10:00.000Z", note: "Belum diverifikasi — sebagian transaksi tampaknya push-only." },
  { source: "dana", emailSupported: false, lastSeenAt: null, note: "Tidak mengirim email transaksi. Perlu input manual." },
];
