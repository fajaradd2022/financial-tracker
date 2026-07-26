import { randomUUID } from "node:crypto";
import { index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

/**
 * Skema database aplikasi (SQLite via Drizzle).
 *
 * Catatan bentuk data yang berlaku di seluruh file ini:
 * - **Waktu** disimpan sebagai string ISO 8601 UTC, bukan integer epoch.
 *   Alasannya bisa dibaca langsung saat men-debug isi tabel, dan bentuknya sama
 *   persis dengan yang dipakai lapisan UI — tidak ada konversi di tengah.
 * - **Nominal** disimpan sebagai integer rupiah penuh. Rupiah tidak dipakai
 *   sampai satuan sen, jadi tidak ada alasan menyimpan pecahan; integer juga
 *   membebaskan penjumlahan dari galat pembulatan float.
 * - **Boolean** memakai integer 0/1 (SQLite tidak punya tipe boolean).
 *
 * ## Multi-tenant
 *
 * Setiap tabel data punya `user_id`. Seluruh penyaringannya dikerjakan di
 * `repositories.ts`, yang mewajibkan `userId` sebagai parameter pertama.
 *
 * `user_id` sengaja TIDAK dideklarasikan sebagai foreign key ke tabel `user`.
 * Tabel itu milik Better Auth dan dikelola migrator-nya sendiri; kalau ikut
 * dideklarasikan di sini, drizzle-kit akan mencoba membuatnya juga dan kedua
 * migrator berebut satu tabel. Sebagai gantinya penghapusan berantai dikerjakan
 * eksplisit lewat `deleteAllUserData()` di repositories — lebih terlihat dan
 * bisa diuji, ketimbang mengandalkan perilaku yang tidak tercatat di skema.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const userId = () => text("user_id").notNull();

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
// Direktori pengguna
// ---------------------------------------------------------------------------

/**
 * Salinan minimal identitas user (nama & email) yang dimiliki aplikasi.
 *
 * Ada karena fitur kolaborasi perlu mencari user lewat email dan menampilkan
 * nama kolaborator, sementara tabel `user` milik Better Auth tidak boleh
 * dideklarasikan di skema Drizzle — kalau ikut dideklarasikan, drizzle-kit akan
 * mencoba membuatnya juga dan kedua migrator berebut satu tabel.
 *
 * Selain menghindari benturan itu, tabel ini juga membatasi apa yang bisa
 * disentuh jalur kolaborasi: hanya nama dan email, bukan hash password atau
 * status ban. Disinkronkan lewat database hook Better Auth
 * (lihat `src/lib/auth.ts`).
 */
export const userDirectory = sqliteTable("user_directory", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  updatedAt: text("updated_at").notNull().$defaultFn(nowIso),
});

// ---------------------------------------------------------------------------
// Kategori
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    /**
     * Kategori sistem tidak boleh dihapus/diubah nama user, karena dipakai
     * otomatis oleh aturan tetap (tarik tunai, dana kolaborasi).
     */
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    /** Penanda kategori sistem mana — dipakai kode untuk mencarinya. */
    systemKey: text("system_key", {
      enum: ["cash_expense", "collaboration_in", "collaboration_out"],
    }),
    /** Soft-delete: dinonaktifkan, bukan dihapus, agar transaksi lama tetap berlabel. */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [
    // Keunikan nama berlaku per user, bukan global — dua user boleh sama-sama
    // punya kategori "Belanja".
    unique("categories_user_name_kind_unique").on(t.userId, t.name, t.kind),
    index("categories_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Rekening milik sendiri (dasar deteksi transfer internal)
// ---------------------------------------------------------------------------

/**
 * Rekening milik user itu sendiri. Sejak aplikasi jadi multi-tenant, rekening
 * pasangan TIDAK lagi masuk sini — pasangan adalah tenant terpisah, dan
 * transfer ke sana adalah pengeluaran sungguhan yang ditangani fitur kolaborasi.
 */
export const ownAccounts = sqliteTable(
  "own_accounts",
  {
    id: id(),
    userId: userId(),
    bank: text("bank", { enum: BANK_SOURCES }).notNull(),
    /** Nomor rekening, atau nomor HP untuk e-wallet. */
    accountNumberOrIdentifier: text("account_number_or_identifier").notNull(),
    label: text("label").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [
    unique("own_accounts_user_bank_number_unique").on(
      t.userId,
      t.bank,
      t.accountNumberOrIdentifier,
    ),
    // Pencocokan transfer internal mencari lewat nomor saja (lintas bank),
    // karena email sering tidak menyebut banknya secara eksplisit.
    index("own_accounts_user_number_idx").on(
      t.userId,
      t.accountNumberOrIdentifier,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Transaksi
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    userId: userId(),
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
     * Unique-nya digabung dengan user karena inbox tiap user berbeda — id pesan
     * hanya unik di dalam satu mailbox.
     */
    gmailMessageId: text("gmail_message_id"),
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

    /**
     * Penanda "transaksi ini dibayar dari dana kolaborasi".
     *
     * Diisi PENERIMA dana, dan inilah satu-satunya cara angka "terpakai" bisa
     * terisi — uang di rekening sudah bercampur, jadi sistem tidak bisa tahu
     * sendiri rupiah mana yang berasal dari pemberi.
     */
    fundedByCollaborationId: text("funded_by_collaboration_id"),

    createdAt: text("created_at").notNull().$defaultFn(nowIso),
    updatedAt: text("updated_at").notNull().$defaultFn(nowIso),
  },
  (t) => [
    unique("transactions_user_gmail_message_unique").on(
      t.userId,
      t.gmailMessageId,
    ),
    index("transactions_funded_by_idx").on(t.fundedByCollaborationId),
    index("transactions_user_occurred_at_idx").on(t.userId, t.occurredAt),
    index("transactions_user_needs_review_idx").on(t.userId, t.needsReview),
    index("transactions_user_category_idx").on(t.userId, t.categoryId),
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
    userId: userId(),
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
  (t) => [index("cash_entries_user_occurred_at_idx").on(t.userId, t.occurredAt)],
);

// ---------------------------------------------------------------------------
// Kolaborasi
// ---------------------------------------------------------------------------

/**
 * Hubungan kolaborasi antar dua user.
 *
 * Dibentuk lewat undangan + persetujuan, sekali saja. Persetujuan itu bukan
 * formalitas: mengirim dana kolaborasi berarti menulis entri ke buku keuangan
 * orang lain, dan tanpa persetujuan siapa pun bisa membanjiri buku orang lain
 * dengan entri sampah.
 */
export const collaborations = sqliteTable(
  "collaborations",
  {
    id: id(),
    requesterUserId: text("requester_user_id").notNull(),
    addresseeUserId: text("addressee_user_id").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "revoked"],
    })
      .notNull()
      .default("pending"),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
    respondedAt: text("responded_at"),
  },
  (t) => [
    unique("collaborations_pair_unique").on(
      t.requesterUserId,
      t.addresseeUserId,
    ),
    index("collaborations_requester_idx").on(t.requesterUserId),
    index("collaborations_addressee_idx").on(t.addresseeUserId),
  ],
);

/**
 * Satu perpindahan dana antar kolaborator.
 *
 * Berperan sebagai **penghubung**, bukan sebagai transaksi tambahan. Kalau A
 * transfer ke B lewat bank, bank B juga mengirim email ke aplikasi B — jadi
 * pemasukan itu sudah tercatat sendiri lewat ingestion biasa. Membuat transaksi
 * kedua di sini akan menggandakan angkanya.
 *
 * Siklus statusnya:
 * - `pending_match` — belum menambah angka apa pun di buku penerima
 * - `linked`        — dikaitkan ke transaksi penerima yang sudah ada
 * - `accepted`      — tidak ada pasangan (mis. pemberian tunai), sistem
 *                     membuatkan transaksi pemasukan
 * - `rejected`      — penerima menolak; tidak pernah memengaruhi angka
 */
export const collaborationEntries = sqliteTable(
  "collaboration_entries",
  {
    id: id(),
    collaborationId: text("collaboration_id")
      .notNull()
      .references(() => collaborations.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    amount: integer("amount").notNull(),
    occurredAt: text("occurred_at").notNull(),
    note: text("note"),
    status: text("status", {
      enum: ["pending_match", "linked", "accepted", "rejected"],
    })
      .notNull()
      .default("pending_match"),
    /** Pengeluaran di sisi pemberi yang menjadi asal entri ini. */
    senderTransactionId: text("sender_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    /** Pemasukan di sisi penerima, setelah dikaitkan atau dibuatkan. */
    recipientTransactionId: text("recipient_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
    resolvedAt: text("resolved_at"),
  },
  (t) => [
    index("collab_entries_to_user_idx").on(t.toUserId, t.status),
    index("collab_entries_from_user_idx").on(t.fromUserId),
    index("collab_entries_collab_idx").on(t.collaborationId),
  ],
);

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export const whatsappNumbers = sqliteTable(
  "whatsapp_numbers",
  {
    id: id(),
    userId: userId(),
    /**
     * Format E.164, sama dengan yang dikirim webhook WAHA.
     * Unik secara GLOBAL, bukan per user: bot harus bisa menentukan buku siapa
     * yang ditulis hanya dari nomor pengirim, jadi satu nomor tidak boleh
     * terdaftar di dua akun.
     */
    phoneE164: text("phone_e164").notNull().unique(),
    label: text("label").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
  },
  (t) => [index("whatsapp_numbers_user_idx").on(t.userId)],
);

/**
 * Aksi destruktif dari WhatsApp yang menunggu konfirmasi "YA".
 *
 * Aksi yang menghapus atau mengubah data TIDAK pernah langsung dieksekusi dari
 * chat. Chat penuh singkatan dan typo, dan salah tafsir LLM atas kalimat
 * ambigu bisa berarti transaksi hilang tanpa sengaja. Membuat, mencari, dan
 * melaporkan tidak lewat sini — semuanya bisa dibatalkan atau tidak mengubah
 * apa pun.
 */
export const waPendingConfirmations = sqliteTable(
  "wa_pending_confirmations",
  {
    id: id(),
    userId: userId(),
    /** Nomor yang harus membalas YA — bukan sekadar user-nya. */
    phoneE164: text("phone_e164").notNull(),
    actionType: text("action_type", {
      enum: ["delete_transaction", "update_transaction", "delete_cash_entry"],
    }).notNull(),
    /** Argumen aksi, disimpan apa adanya untuk dieksekusi saat dikonfirmasi. */
    payload: text("payload", { mode: "json" }).notNull(),
    /** Ringkasan yang ditampilkan ke user saat meminta konfirmasi. */
    summary: text("summary").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(nowIso),
    /** Setelah lewat, "YA" tidak lagi mengeksekusi apa pun. */
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("wa_pending_phone_idx").on(t.phoneE164)],
);

// ---------------------------------------------------------------------------
// Konfigurasi & status ingestion
// ---------------------------------------------------------------------------

/** Konfigurasi ingestion — satu baris per user. */
export const ingestionConfig = sqliteTable("ingestion_config", {
  userId: text("user_id").primaryKey(),
  inboxEmail: text("inbox_email").notNull().default(""),
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(12),
  backfillEnabled: integer("backfill_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  lastPolledAt: text("last_polled_at"),
  updatedAt: text("updated_at").notNull().$defaultFn(nowIso),
});

/**
 * Kredensial Gmail per user.
 *
 * Refresh token disimpan TERENKRIPSI (AES-256-GCM, lihat `lib/crypto.ts`).
 * Token ini memberi akses baca ke inbox seseorang, jadi menyimpannya sebagai
 * teks polos berarti siapa pun yang bisa membaca berkas database — termasuk
 * dari salinan backup yang tercecer — bisa membaca email mereka.
 *
 * Client ID & Secret TIDAK disimpan di sini: keduanya milik satu OAuth app
 * kepunyaan pemilik instalasi, jadi tetap di `.env`. Yang berbeda per user
 * hanyalah refresh token dan inbox yang dihubungkan.
 */
export const gmailCredentials = sqliteTable("gmail_credentials", {
  userId: text("user_id").primaryKey(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  inboxEmail: text("inbox_email").notNull(),
  connectedAt: text("connected_at").notNull().$defaultFn(nowIso),
  /** Diisi saat penukaran token ditolak Google — sinyal perlu hubungkan ulang. */
  lastErrorAt: text("last_error_at"),
  lastError: text("last_error"),
});

/** Hasil verifikasi tiap sumber: apakah benar mengirim email yang bisa diparsing. */
export const sourceHealth = sqliteTable(
  "source_health",
  {
    userId: userId(),
    source: text("source", { enum: BANK_SOURCES }).notNull(),
    /** null = belum diverifikasi. */
    emailSupported: integer("email_supported", { mode: "boolean" }),
    lastSeenAt: text("last_seen_at"),
    note: text("note").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source] })],
);

/**
 * Penanda kemajuan polling (key-value), per user.
 *
 * Kursor hanya dimajukan setelah satu putaran polling selesai penuh, sehingga
 * proses yang mati di tengah akan mengulang jendela yang sama — melewatkan
 * email jauh lebih buruk daripada memprosesnya dua kali, karena duplikat sudah
 * ditangkis unique constraint pada `(user_id, gmail_message_id)`.
 */
export const syncState = sqliteTable(
  "sync_state",
  {
    userId: userId(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: text("updated_at").notNull().$defaultFn(nowIso),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type CategoryRow = typeof categories.$inferSelect;
export type OwnAccountRow = typeof ownAccounts.$inferSelect;
export type CashWalletEntryRow = typeof cashWalletEntries.$inferSelect;
export type WhatsAppNumberRow = typeof whatsappNumbers.$inferSelect;
export type IngestionConfigRow = typeof ingestionConfig.$inferSelect;
export type SourceHealthRow = typeof sourceHealth.$inferSelect;
export type GmailCredentialRow = typeof gmailCredentials.$inferSelect;
export type CollaborationRow = typeof collaborations.$inferSelect;
export type CollaborationEntryRow = typeof collaborationEntries.$inferSelect;
