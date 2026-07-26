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

  /**
   * Diisi penerima dana untuk menandai "belanja ini dibayar dari dana
   * kolaborasi". Satu-satunya cara angka "terpakai" bisa terisi, karena uang di
   * rekening sudah bercampur dan sistem tidak bisa menebaknya sendiri.
   */
  fundedByCollaborationId: string | null;
}

export type CategoryKind = "expense" | "income";

/** Kategori yang dipakai otomatis oleh aturan tetap, dikenali kode lewat kunci ini. */
export type CategorySystemKey =
  | "cash_expense"
  | "collaboration_in"
  | "collaboration_out";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Kategori sistem (mis. "Cash Expense") tidak boleh dihapus/diubah nama. */
  isSystem: boolean;
  systemKey: CategorySystemKey | null;
  /** Soft-delete: dinonaktifkan, bukan dihapus, agar transaksi lama tetap berlabel. */
  isActive: boolean;
  sortOrder: number;
}

/**
 * Rekening milik user itu sendiri.
 *
 * Sejak aplikasi jadi multi-tenant, rekening pasangan tidak lagi masuk sini —
 * pasangan adalah tenant terpisah, dan transfer ke sana adalah pengeluaran
 * sungguhan yang ditangani fitur kolaborasi.
 */
export interface OwnAccount {
  id: string;
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

// ---------------------------------------------------------------------------
// Kolaborasi
// ---------------------------------------------------------------------------

export type CollaborationStatus = "pending" | "accepted" | "revoked";

export type CollaborationEntryStatus =
  | "pending_match"
  | "linked"
  | "accepted"
  | "rejected";

/** Hubungan kolaborasi dilihat dari sudut pandang satu user. */
export interface Collaboration {
  id: string;
  status: CollaborationStatus;
  /** true kalau user inilah yang mengirim undangan. */
  isRequester: boolean;
  partnerUserId: string;
  partnerName: string;
  partnerEmail: string;
  createdAt: string;
}

export interface CollaborationEntry {
  id: string;
  collaborationId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  status: CollaborationEntryStatus;
  senderTransactionId: string | null;
  recipientTransactionId: string | null;
}

/**
 * Ringkasan satu kantong kolaborasi.
 *
 * Ini SATU-SATUNYA bentuk data lintas-tenant yang boleh menyeberang: pemberi
 * hanya menerima tiga angka, tidak pernah baris transaksi penerima.
 */
export interface CollaborationSummary {
  collaborationId: string;
  partnerName: string;
  partnerEmail: string;
  /** "out" = user memberi ke partner, "in" = user menerima dari partner. */
  direction: "in" | "out";
  /** Total dana yang sudah dikaitkan/diterima. */
  total: number;
  /** Total yang sudah ditandai terpakai oleh penerima. */
  spent: number;
  /** total − spent. Akumulatif lintas periode. */
  remaining: number;
  /** Entri yang masih menunggu dicocokkan penerima. */
  pendingCount: number;
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
