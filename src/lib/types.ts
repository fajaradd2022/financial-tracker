/**
 * Tipe data domain Financial Tracker.
 *
 * Bentuknya sengaja dibuat sama dengan skema Postgres/Drizzle yang direncanakan
 * (lihat PRD.md), supaya nanti saat backend dipasang, frontend tidak perlu
 * dirombak — cukup ganti sumber datanya dari dummy ke query database.
 */

/** Sumber transaksi: bank, e-wallet, atau entri manual. */
export type TransactionSource =
  | "bca"
  | "blu_bca"
  | "seabank"
  | "shopeepay"
  | "ovo"
  | "dana"
  | "gopay"
  | "manual_cash"
  | "manual_other";

/** Bank/e-wallet saja — dipakai untuk whitelist rekening sendiri. */
export type BankSource = Exclude<
  TransactionSource,
  "manual_cash" | "manual_other"
>;

/** Arah uang: masuk ke rekening kita, atau keluar. */
export type TransactionDirection = "in" | "out";

/** Dari mana baris ini tercipta. */
export type TransactionOrigin = "email" | "manual_web" | "manual_wa";

/** Seberapa yakin LLM saat mengekstrak email jadi data terstruktur. */
export type ExtractionConfidence = "high" | "low";

/** Cara sebuah transfer dikenali sebagai transfer antar rekening sendiri. */
export type InternalMatchType = "account_number" | "fuzzy_name";

/** Alasan sebuah transaksi masuk antrean review (passive queue). */
export type ReviewReason =
  | "low_confidence_extraction"
  | "fuzzy_internal_match"
  | "uncategorized"
  | "manual_flag";

export interface Transaction {
  id: string;
  source: TransactionSource;
  direction: TransactionDirection;
  /** Nominal dalam Rupiah, selalu positif. Arah ditentukan oleh `direction`. */
  amount: number;
  /** ISO 8601. Waktu transaksi menurut email banknya, bukan waktu diproses. */
  occurredAt: string;
  counterpartyName: string | null;
  counterpartyAccountNumber: string | null;
  /** Label asli dari bank, misal "TARIK TUNAI ATM" atau "QRIS DEBIT". */
  rawTransactionType: string | null;
  origin: TransactionOrigin;
  gmailMessageId: string | null;
  /** Potongan body email, disimpan untuk keperluan audit/debug. */
  rawEmailSnippet: string | null;
  extractionConfidence: ExtractionConfidence;

  categoryId: string | null;
  isInternalTransfer: boolean;
  internalTransferMatchType: InternalMatchType | null;
  needsReview: boolean;
  reviewReason: ReviewReason | null;
}

export type CategoryKind = "expense" | "income";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Kategori sistem (mis. "Cash Expense") tidak boleh dihapus/diubah nama. */
  isSystem: boolean;
  /** Soft-delete: dinonaktifkan, bukan dihapus, agar transaksi lama tetap berlabel. */
  isActive: boolean;
  sortOrder: number;
}

export type AccountOwner = "husband" | "wife";

export interface OwnAccount {
  id: string;
  owner: AccountOwner;
  bank: BankSource;
  /** Nomor rekening, atau nomor HP untuk e-wallet. */
  accountNumberOrIdentifier: string;
  label: string;
  isActive: boolean;
}

export type CashWalletEntryType =
  | "withdrawal_credit"
  | "manual_expense_debit"
  | "adjustment";

export interface CashWalletEntry {
  id: string;
  entryType: CashWalletEntryType;
  /** Selalu positif; tandanya ditentukan oleh `entryType`. */
  amount: number;
  /** Terisi untuk baris tarik tunai — menunjuk ke transaksi asalnya. */
  transactionId: string | null;
  categoryId: string | null;
  note: string | null;
  occurredAt: string;
  origin: TransactionOrigin;
}

export interface WhatsAppNumber {
  id: string;
  phoneE164: string;
  label: string;
  isActive: boolean;
}

/** Konfigurasi penarikan email yang bisa diubah dari halaman Pengaturan. */
export interface IngestionConfig {
  /** Inbox khusus tujuan forward, bukan Gmail pribadi. */
  inboxEmail: string;
  pollIntervalMinutes: number;
  /** Menarik email lama saat pertama diaktifkan. */
  backfillEnabled: boolean;
  enabled: boolean;
  /** null selama polling belum pernah berjalan sama sekali. */
  lastPolledAt: string | null;
}

/** Hasil validasi ingestion per sumber — dipakai di halaman Pengaturan. */
export interface SourceHealth {
  source: BankSource;
  /** Apakah sumber ini terbukti mengirim email transaksi yang bisa diparsing. */
  emailSupported: boolean | null;
  lastSeenAt: string | null;
  note: string;
}
