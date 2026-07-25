import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

/**
 * Skema database aplikasi (SQLite via Drizzle).
 *
 * Catatan bentuk data yang berlaku di seluruh file ini:
 * - **Waktu** disimpan sebagai string ISO 8601 UTC, bukan integer epoch.
 *   Alasannya bisa dibaca langsung saat men-debug isi tabel, dan bentuknya sama
 *   persis dengan yang sudah dipakai lapisan UI — tidak ada konversi di tengah.
 * - **Nominal** disimpan sebagai integer rupiah penuh. Rupiah tidak dipakai
 *   sampai satuan sen, jadi tidak ada alasan menyimpan pecahan; integer juga
 *   membebaskan penjumlahan dari galat pembulatan float.
 * - **Boolean** memakai integer 0/1 (SQLite tidak punya tipe boolean).
 *
 * Tabel milik Better Auth (user, session, account, verification) hidup di file
 * database yang sama tapi dikelola migrator Better Auth sendiri, jadi sengaja
 * tidak didefinisikan ulang di sini.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const nowIso = () => new Date().toISOString();

export const TRANSACTION_SOURCES = [
  "bca",
  "blu_bca",
  "seabank",
  "shopeepay",
  "ovo",
  "dana",
  "gopay",
  "manual_cash",
  "manual_other",
] as const;

export const BANK_SOURCES = [
  "bca",
  "blu_bca",
  "seabank",
  "shopeepay",
  "ovo",
  "dana",
  "gopay",
] as const;

// ---------------------------------------------------------------------------
// Kategori
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    /** Kategori sistem ("Cash Expense") tidak boleh dihapus/diubah nama. */
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    /** Soft-delete: dinonaktifkan, bukan dihapus, agar transaksi lama tetap berlabel. */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [unique("categories_name_kind_unique").on(t.name, t.kind)],
);

// ---------------------------------------------------------------------------
// Rekening milik sendiri (dasar deteksi transfer internal)
// ---------------------------------------------------------------------------

export const ownAccounts = sqliteTable(
  "own_accounts",
  {
    id: id(),
    owner: text("owner", { enum: ["husband", "wife"] }).notNull(),
    bank: text("bank", { enum: BANK_SOURCES }).notNull(),
    /** Nomor rekening, atau nomor HP untuk e-wallet. */
    accountNumberOrIdentifier: text("account_number_or_identifier").notNull(),
    label: text("label").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [
    unique("own_accounts_bank_number_unique").on(
      t.bank,
      t.accountNumberOrIdentifier,
    ),
    // Pencocokan transfer internal mencari lewat nomor saja (lintas bank),
    // karena email sering tidak menyebut banknya secara eksplisit.
    index("own_accounts_number_idx").on(t.accountNumberOrIdentifier),
  ],
);

// ---------------------------------------------------------------------------
// Transaksi
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    source: text("source", { enum: TRANSACTION_SOURCES }).notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    /** Rupiah penuh, selalu positif. Arahnya ditentukan `direction`. */
    amount: integer("amount").notNull(),
    /** ISO 8601. Waktu transaksi menurut email banknya, bukan waktu diproses. */
    occurredAt: text("occurred_at").notNull(),
    counterpartyName: text("counterparty_name"),
    counterpartyAccountNumber: text("counterparty_account_number"),
    /** Label asli dari bank, mis. "TARIK TUNAI ATM". */
    rawTransactionType: text("raw_transaction_type"),
    origin: text("origin", { enum: ["email", "manual_web", "manual_wa"] })
      .notNull()
      .default("email"),

    /**
     * Kunci idempotensi ingestion: satu email hanya boleh jadi satu transaksi.
     * Unique constraint inilah yang membuat polling yang jendelanya tumpang
     * tindih tetap aman diulang.
     */
    gmailMessageId: text("gmail_message_id").unique(),
    rawEmailSnippet: text("raw_email_snippet"),
    /** Respons mentah LLM, disimpan agar ekstraksi bisa ditelusuri/diproses ulang. */
    llmRawResponse: text("llm_raw_response", { mode: "json" }),
    extractionConfidence: text("extraction_confidence", {
      enum: ["high", "low"],
    })
      .notNull()
      .default("high"),

    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    isInternalTransfer: integer("is_internal_transfer", { mode: "boolean" })
      .notNull()
      .default(false),
    internalTransferMatchType: text("internal_transfer_match_type", {
      enum: ["account_number", "fuzzy_name"],
    }),
    needsReview: integer("needs_review", { mode: "boolean" })
      .notNull()
      .default(false),
    reviewReason: text("review_reason", {
      enum: [
        "low_confidence_extraction",
        "fuzzy_internal_match",
        "uncategorized",
        "manual_flag",
      ],
    }),

    createdAt: text("created_at").notNull().$defaultFn(nowIso),
    updatedAt: text("updated_at").notNull().$defaultFn(nowIso),
  },
  (t) => [
    index("transactions_occurred_at_idx").on(t.occurredAt),
    index("transactions_needs_review_idx").on(t.needsReview),
    index("transactions_category_idx").on(t.categoryId),
  ],
);

// ---------------------------------------------------------------------------
// Dompet tunai
// ---------------------------------------------------------------------------

/**
 * Buku besar dompet tunai. Saldonya TIDAK disimpan sebagai kolom berjalan,
 * melainkan dihitung `SUM` dari baris-baris ini. Dengan begitu koreksi atau
 * penghapusan satu catatan otomatis benar tanpa perlu penulisan penyeimbang —
 * penting karena kanal WhatsApp nanti mengizinkan edit & hapus.
 */
export const cashWalletEntries = sqliteTable(
  "cash_wallet_entries",
  {
    id: id(),
    entryType: text("entry_type", {
      enum: ["withdrawal_credit", "manual_expense_debit", "adjustment"],
    }).notNull(),
    /** Selalu positif; tandanya ditentukan `entryType`. */
    amount: integer("amount").notNull(),
    /** Terisi untuk baris tarik tunai — menunjuk transaksi asalnya. */
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "cascade",
    }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    occurredAt: text("occurred_at").notNull(),
    origin: text("origin", { enum: ["email", "manual_web", "manual_wa"] })
      .notNull()
      .default("manual_web"),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [index("cash_entries_occurred_at_idx").on(t.occurredAt)],
);

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export const whatsappNumbers = sqliteTable("whatsapp_numbers", {
  id: id(),
  /** Format E.164, sama dengan yang dikirim webhook WAHA. */
  phoneE164: text("phone_e164").notNull().unique(),
  label: text("label").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(nowIso),
});

// ---------------------------------------------------------------------------
// Konfigurasi & status ingestion
// ---------------------------------------------------------------------------

/**
 * Baris tunggal konfigurasi ingestion. `id` dikunci ke nilai tetap supaya tidak
 * mungkin ada dua baris konfigurasi yang saling bertentangan.
 */
export const ingestionConfig = sqliteTable("ingestion_config", {
  id: text("id").primaryKey().default("singleton"),
  inboxEmail: text("inbox_email").notNull(),
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(12),
  backfillEnabled: integer("backfill_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastPolledAt: text("last_polled_at"),
  updatedAt: text("updated_at").notNull().$defaultFn(nowIso),
});

/** Hasil verifikasi tiap sumber: apakah benar mengirim email yang bisa diparsing. */
export const sourceHealth = sqliteTable("source_health", {
  source: text("source", { enum: BANK_SOURCES }).primaryKey(),
  /** null = belum diverifikasi. */
  emailSupported: integer("email_supported", { mode: "boolean" }),
  lastSeenAt: text("last_seen_at"),
  note: text("note").notNull().default(""),
});

/**
 * Penanda kemajuan polling (key-value).
 *
 * Kursor hanya dimajukan setelah satu putaran polling selesai penuh, sehingga
 * proses yang mati di tengah akan mengulang jendela yang sama — melewatkan
 * email jauh lebih buruk daripada memprosesnya dua kali, karena duplikat sudah
 * ditangkis unique constraint `gmail_message_id`.
 */
export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(nowIso),
});

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type CategoryRow = typeof categories.$inferSelect;
export type OwnAccountRow = typeof ownAccounts.$inferSelect;
export type CashWalletEntryRow = typeof cashWalletEntries.$inferSelect;
export type WhatsAppNumberRow = typeof whatsappNumbers.$inferSelect;
export type IngestionConfigRow = typeof ingestionConfig.$inferSelect;
export type SourceHealthRow = typeof sourceHealth.$inferSelect;
