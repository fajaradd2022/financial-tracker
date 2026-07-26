import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "./connection";
import {
  cashWalletEntries,
  categories,
  collaborationEntries,
  collaborations,
  gmailCredentials,
  ingestionConfig,
  ownAccounts,
  sourceHealth,
  syncState,
  transactions,
  userDirectory,
  waPendingConfirmations,
  whatsappNumbers,
} from "./schema";
import { SEED_CATEGORIES, SEED_SOURCE_HEALTH } from "./seed-data";
import type {
  CashWalletEntry,
  Category,
  Collaboration,
  CollaborationEntry,
  CollaborationSummary,
  IngestionConfig,
  OwnAccount,
  SourceHealth,
  Transaction,
  WhatsAppNumber,
} from "@/lib/types";

/**
 * Satu-satunya tempat kueri database ditulis.
 *
 * Modul ini hanya boleh dipakai dari kode server (server component, server
 * action, skrip CLI). Tidak diberi penjaga `server-only` supaya bisa dipakai
 * juga oleh job polling yang berjalan di proses Node biasa; pengamanannya
 * datang dari `better-sqlite3` yang merupakan modul native dan otomatis gagal
 * di-bundle ke sisi client.
 *
 * ## Aturan multi-tenant (wajib)
 *
 * 1. Setiap fungsi menerima `userId` sebagai **parameter pertama yang wajib**.
 *    Tidak ada nilai default — nilai default adalah cara termudah membuat
 *    kebocoran diam-diam; kalau wajib, kompiler yang menangkap kelalaian.
 *
 * 2. `update`/`delete` menyaring `id AND user_id`, bukan `id` saja. Menyaring
 *    berdasarkan id saja berarti siapa pun yang menebak id bisa mengubah data
 *    orang lain lewat server action.
 *
 * Semua fungsi mengembalikan bentuk yang sama persis dengan tipe domain di
 * `lib/types.ts`, bukan baris mentah Drizzle. Dengan begitu lapisan UI tidak
 * pernah bergantung pada detail skema, dan pergantian database nanti (mis. ke
 * Postgres) berhenti di berkas ini.
 */

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export async function listTransactions(
  userId: string,
): Promise<Transaction[]> {
  return db
    .select({
      id: transactions.id,
      source: transactions.source,
      direction: transactions.direction,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      counterpartyName: transactions.counterpartyName,
      counterpartyAccountNumber: transactions.counterpartyAccountNumber,
      rawTransactionType: transactions.rawTransactionType,
      origin: transactions.origin,
      gmailMessageId: transactions.gmailMessageId,
      rawEmailSnippet: transactions.rawEmailSnippet,
      extractionConfidence: transactions.extractionConfidence,
      categoryId: transactions.categoryId,
      isInternalTransfer: transactions.isInternalTransfer,
      internalTransferMatchType: transactions.internalTransferMatchType,
      needsReview: transactions.needsReview,
      reviewReason: transactions.reviewReason,
      fundedByCollaborationId: transactions.fundedByCollaborationId,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.occurredAt));
}

export async function listCategories(userId: string): Promise<Category[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      isSystem: categories.isSystem,
      systemKey: categories.systemKey,
      isActive: categories.isActive,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.kind), asc(categories.sortOrder));
}

export async function listOwnAccounts(userId: string): Promise<OwnAccount[]> {
  return db
    .select({
      id: ownAccounts.id,
      bank: ownAccounts.bank,
      accountNumberOrIdentifier: ownAccounts.accountNumberOrIdentifier,
      label: ownAccounts.label,
      isActive: ownAccounts.isActive,
    })
    .from(ownAccounts)
    .where(eq(ownAccounts.userId, userId))
    .orderBy(asc(ownAccounts.label));
}

export async function listCashEntries(
  userId: string,
): Promise<CashWalletEntry[]> {
  return db
    .select({
      id: cashWalletEntries.id,
      entryType: cashWalletEntries.entryType,
      amount: cashWalletEntries.amount,
      transactionId: cashWalletEntries.transactionId,
      categoryId: cashWalletEntries.categoryId,
      note: cashWalletEntries.note,
      occurredAt: cashWalletEntries.occurredAt,
      origin: cashWalletEntries.origin,
    })
    .from(cashWalletEntries)
    .where(eq(cashWalletEntries.userId, userId))
    .orderBy(desc(cashWalletEntries.occurredAt));
}

export async function listWhatsAppNumbers(
  userId: string,
): Promise<WhatsAppNumber[]> {
  return db
    .select({
      id: whatsappNumbers.id,
      phoneE164: whatsappNumbers.phoneE164,
      label: whatsappNumbers.label,
      isActive: whatsappNumbers.isActive,
    })
    .from(whatsappNumbers)
    .where(eq(whatsappNumbers.userId, userId))
    .orderBy(asc(whatsappNumbers.label));
}

export async function listSourceHealth(
  userId: string,
): Promise<SourceHealth[]> {
  return db
    .select({
      source: sourceHealth.source,
      emailSupported: sourceHealth.emailSupported,
      lastSeenAt: sourceHealth.lastSeenAt,
      note: sourceHealth.note,
    })
    .from(sourceHealth)
    .where(eq(sourceHealth.userId, userId));
}

export async function getIngestionConfig(
  userId: string,
): Promise<IngestionConfig> {
  const [row] = await db
    .select({
      inboxEmail: ingestionConfig.inboxEmail,
      pollIntervalMinutes: ingestionConfig.pollIntervalMinutes,
      backfillEnabled: ingestionConfig.backfillEnabled,
      enabled: ingestionConfig.enabled,
      lastPolledAt: ingestionConfig.lastPolledAt,
    })
    .from(ingestionConfig)
    .where(eq(ingestionConfig.userId, userId));

  // Barisnya dibuat saat user di-provision. Kalau hilang, kembalikan default
  // yang aman (ingestion mati) daripada melempar dan menjatuhkan halaman.
  return (
    row ?? {
      inboxEmail: "",
      pollIntervalMinutes: 12,
      backfillEnabled: false,
      enabled: false,
      lastPolledAt: null,
    }
  );
}

/** User yang ingestion-nya menyala — dipakai penjadwal untuk berputar. */
export async function listUsersWithIngestionEnabled(): Promise<string[]> {
  const rows = await db
    .select({ userId: ingestionConfig.userId })
    .from(ingestionConfig)
    .where(eq(ingestionConfig.enabled, true));
  return rows.map((r) => r.userId);
}

// ---------------------------------------------------------------------------
// Tulis — transaksi
// ---------------------------------------------------------------------------

/**
 * Penandaan dana kolaborasi hampir selalu menyusul belakangan (diisi penerima),
 * jadi dibuat opsional agar setiap pemanggil tidak perlu menulis `null` eksplisit.
 */
export type NewTransactionInput = Omit<
  Transaction,
  "id" | "fundedByCollaborationId"
> & { fundedByCollaborationId?: string | null };

export async function insertTransaction(
  userId: string,
  input: NewTransactionInput,
): Promise<string> {
  const [row] = await db
    .insert(transactions)
    .values({ ...input, userId })
    .returning({ id: transactions.id });
  return row.id;
}

export async function updateTransaction(
  userId: string,
  id: string,
  patch: Partial<Omit<Transaction, "id">>,
) {
  await db
    .update(transactions)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function deleteTransaction(userId: string, id: string) {
  // Baris dompet tunai yang lahir dari transaksi ini ikut terhapus lewat
  // ON DELETE CASCADE, jadi saldo tidak lagi menghitung tarik tunai yang
  // sumbernya sudah tiada.
  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

/** Cek idempotensi ingestion — satu email hanya boleh jadi satu transaksi. */
export async function transactionExistsForMessage(
  userId: string,
  gmailMessageId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.gmailMessageId, gmailMessageId),
      ),
    );
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Tulis — kategori
// ---------------------------------------------------------------------------

export async function insertCategory(
  userId: string,
  input: Omit<Category, "id">,
) {
  await db.insert(categories).values({ ...input, userId });
}

export async function updateCategory(
  userId: string,
  id: string,
  patch: Partial<Omit<Category, "id">>,
) {
  await db
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

export async function deleteCategory(userId: string, id: string) {
  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

// ---------------------------------------------------------------------------
// Tulis — rekening sendiri
// ---------------------------------------------------------------------------

export async function insertOwnAccount(
  userId: string,
  input: Omit<OwnAccount, "id">,
) {
  await db.insert(ownAccounts).values({ ...input, userId });
}

export async function updateOwnAccount(
  userId: string,
  id: string,
  patch: Partial<Omit<OwnAccount, "id">>,
) {
  await db
    .update(ownAccounts)
    .set(patch)
    .where(and(eq(ownAccounts.id, id), eq(ownAccounts.userId, userId)));
}

export async function deleteOwnAccount(userId: string, id: string) {
  await db
    .delete(ownAccounts)
    .where(and(eq(ownAccounts.id, id), eq(ownAccounts.userId, userId)));
}

// ---------------------------------------------------------------------------
// Tulis — dompet tunai
// ---------------------------------------------------------------------------

export async function insertCashEntry(
  userId: string,
  input: Omit<CashWalletEntry, "id">,
) {
  await db.insert(cashWalletEntries).values({ ...input, userId });
}

export async function updateCashEntry(
  userId: string,
  id: string,
  patch: Partial<Omit<CashWalletEntry, "id">>,
) {
  await db
    .update(cashWalletEntries)
    .set(patch)
    .where(
      and(eq(cashWalletEntries.id, id), eq(cashWalletEntries.userId, userId)),
    );
}

export async function deleteCashEntry(userId: string, id: string) {
  await db
    .delete(cashWalletEntries)
    .where(
      and(eq(cashWalletEntries.id, id), eq(cashWalletEntries.userId, userId)),
    );
}

// ---------------------------------------------------------------------------
// Tulis — WhatsApp & ingestion
// ---------------------------------------------------------------------------

export async function insertWhatsAppNumber(
  userId: string,
  input: Omit<WhatsAppNumber, "id">,
) {
  await db.insert(whatsappNumbers).values({ ...input, userId });
}

export async function updateWhatsAppNumber(
  userId: string,
  id: string,
  patch: Partial<Omit<WhatsAppNumber, "id">>,
) {
  await db
    .update(whatsappNumbers)
    .set(patch)
    .where(and(eq(whatsappNumbers.id, id), eq(whatsappNumbers.userId, userId)));
}

export async function deleteWhatsAppNumber(userId: string, id: string) {
  await db
    .delete(whatsappNumbers)
    .where(and(eq(whatsappNumbers.id, id), eq(whatsappNumbers.userId, userId)));
}

export async function updateIngestionConfig(
  userId: string,
  patch: Partial<IngestionConfig>,
) {
  await db
    .update(ingestionConfig)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(ingestionConfig.userId, userId));
}

// ---------------------------------------------------------------------------
// Kursor polling
// ---------------------------------------------------------------------------

export async function readSyncCursor(
  userId: string,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ value: syncState.value })
    .from(syncState)
    .where(and(eq(syncState.userId, userId), eq(syncState.key, key)));
  return row?.value ?? null;
}

export async function writeSyncCursor(
  userId: string,
  key: string,
  value: string,
) {
  await db
    .insert(syncState)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [syncState.userId, syncState.key],
      set: { value, updatedAt: new Date().toISOString() },
    });
}

// ---------------------------------------------------------------------------
// WhatsApp — routing & konfirmasi
// ---------------------------------------------------------------------------

/**
 * Menentukan buku siapa yang ditulis dari nomor pengirim.
 *
 * Nomor unik secara global (lihat skema), jadi satu nomor tidak mungkin
 * mengarah ke dua akun. Nomor nonaktif dianggap tidak terdaftar.
 */
export async function findUserByWhatsAppNumber(
  phoneE164: string,
): Promise<{ userId: string; label: string } | null> {
  const [row] = await db
    .select({ userId: whatsappNumbers.userId, label: whatsappNumbers.label })
    .from(whatsappNumbers)
    .where(
      and(
        eq(whatsappNumbers.phoneE164, phoneE164),
        eq(whatsappNumbers.isActive, true),
      ),
    );
  return row ?? null;
}

export interface PendingConfirmation {
  id: string;
  userId: string;
  actionType: string;
  payload: Record<string, unknown>;
  summary: string;
  expiresAt: string;
}

/** Konfirmasi yang masih berlaku untuk nomor ini, terbaru dulu. */
export async function getActiveConfirmation(
  phoneE164: string,
): Promise<PendingConfirmation | null> {
  const [row] = await db
    .select({
      id: waPendingConfirmations.id,
      userId: waPendingConfirmations.userId,
      actionType: waPendingConfirmations.actionType,
      payload: waPendingConfirmations.payload,
      summary: waPendingConfirmations.summary,
      expiresAt: waPendingConfirmations.expiresAt,
    })
    .from(waPendingConfirmations)
    .where(eq(waPendingConfirmations.phoneE164, phoneE164))
    .orderBy(desc(waPendingConfirmations.createdAt))
    .limit(1);

  if (!row) return null;
  // Kedaluwarsa diperiksa saat dibaca, bukan lewat pembersih berkala: "YA" yang
  // datang terlambat tidak boleh mengeksekusi apa pun.
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;

  return { ...row, payload: row.payload as Record<string, unknown> };
}

export async function insertConfirmation(input: {
  userId: string;
  phoneE164: string;
  actionType: "delete_transaction" | "update_transaction" | "delete_cash_entry";
  payload: Record<string, unknown>;
  summary: string;
  ttlMinutes?: number;
}) {
  // Satu nomor hanya boleh punya satu konfirmasi tertunda. Kalau ada dua,
  // balasan "YA" jadi ambigu — dan menebak salah satunya bisa menghapus
  // transaksi yang tidak dimaksud.
  await db
    .delete(waPendingConfirmations)
    .where(eq(waPendingConfirmations.phoneE164, input.phoneE164));

  await db.insert(waPendingConfirmations).values({
    userId: input.userId,
    phoneE164: input.phoneE164,
    actionType: input.actionType,
    payload: input.payload,
    summary: input.summary,
    expiresAt: new Date(
      Date.now() + (input.ttlMinutes ?? 10) * 60_000,
    ).toISOString(),
  });
}

export async function clearConfirmations(phoneE164: string) {
  await db
    .delete(waPendingConfirmations)
    .where(eq(waPendingConfirmations.phoneE164, phoneE164));
}

/** Semua nomor aktif milik satu user — untuk notifikasi keluar. */
export async function listActiveNumbersForUser(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ phone: whatsappNumbers.phoneE164 })
    .from(whatsappNumbers)
    .where(
      and(
        eq(whatsappNumbers.userId, userId),
        eq(whatsappNumbers.isActive, true),
      ),
    );
  return rows.map((r) => r.phone);
}

// ---------------------------------------------------------------------------
// Kredensial Gmail
// ---------------------------------------------------------------------------

export interface GmailConnection {
  inboxEmail: string;
  connectedAt: string;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** Status koneksi untuk ditampilkan — TANPA tokennya. */
export async function getGmailConnection(
  userId: string,
): Promise<GmailConnection | null> {
  const [row] = await db
    .select({
      inboxEmail: gmailCredentials.inboxEmail,
      connectedAt: gmailCredentials.connectedAt,
      lastError: gmailCredentials.lastError,
      lastErrorAt: gmailCredentials.lastErrorAt,
    })
    .from(gmailCredentials)
    .where(eq(gmailCredentials.userId, userId));
  return row ?? null;
}

/**
 * Mengambil refresh token terenkripsi.
 *
 * Dipisah dari `getGmailConnection` dengan sengaja: token hanya dibutuhkan job
 * polling, dan memisahkannya membuat jalur yang menyentuh rahasia terlihat
 * jelas — tidak ikut terbawa ke halaman hanya karena butuh menampilkan status.
 */
export async function getGmailRefreshTokenEncrypted(
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ token: gmailCredentials.refreshTokenEncrypted })
    .from(gmailCredentials)
    .where(eq(gmailCredentials.userId, userId));
  return row?.token ?? null;
}

export async function upsertGmailCredentials(
  userId: string,
  refreshTokenEncrypted: string,
  inboxEmail: string,
) {
  await db
    .insert(gmailCredentials)
    .values({ userId, refreshTokenEncrypted, inboxEmail })
    .onConflictDoUpdate({
      target: gmailCredentials.userId,
      set: {
        refreshTokenEncrypted,
        inboxEmail,
        connectedAt: new Date().toISOString(),
        // Menghubungkan ulang membersihkan error lama — kalau tidak, peringatan
        // "perlu hubungkan ulang" akan menempel selamanya meski sudah beres.
        lastError: null,
        lastErrorAt: null,
      },
    });
}

export async function recordGmailError(userId: string, message: string) {
  await db
    .update(gmailCredentials)
    .set({ lastError: message, lastErrorAt: new Date().toISOString() })
    .where(eq(gmailCredentials.userId, userId));
}

export async function deleteGmailCredentials(userId: string) {
  await db
    .delete(gmailCredentials)
    .where(eq(gmailCredentials.userId, userId));
  await db
    .delete(waPendingConfirmations)
    .where(eq(waPendingConfirmations.userId, userId));
}

// ---------------------------------------------------------------------------
// Direktori pengguna
// ---------------------------------------------------------------------------

export async function upsertUserDirectory(
  userId: string,
  name: string,
  email: string,
) {
  await db
    .insert(userDirectory)
    .values({ userId, name, email })
    .onConflictDoUpdate({
      target: userDirectory.userId,
      set: { name, email, updatedAt: new Date().toISOString() },
    });
}

export async function removeUserDirectory(userId: string) {
  await db.delete(userDirectory).where(eq(userDirectory.userId, userId));
  await db
    .delete(gmailCredentials)
    .where(eq(gmailCredentials.userId, userId));
}

/**
 * Mencari user lewat email persis — dipakai saat mengundang kolaborator.
 *
 * Sengaja hanya pencocokan persis dan tanpa fungsi "daftar semua", supaya jalur
 * ini tidak bisa dipakai menelusuri siapa saja yang punya akun di instalasi ini.
 */
export async function findUserByEmail(
  email: string,
): Promise<{ userId: string; name: string; email: string } | null> {
  const [row] = await db
    .select({
      userId: userDirectory.userId,
      name: userDirectory.name,
      email: userDirectory.email,
    })
    .from(userDirectory)
    .where(eq(userDirectory.email, email.trim().toLowerCase()));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Kolaborasi
// ---------------------------------------------------------------------------

/** Semua hubungan kolaborasi yang melibatkan user ini, dari sudut pandangnya. */
export async function listCollaborations(
  userId: string,
): Promise<Collaboration[]> {
  const rows = await db
    .select({
      id: collaborations.id,
      status: collaborations.status,
      requesterUserId: collaborations.requesterUserId,
      addresseeUserId: collaborations.addresseeUserId,
      createdAt: collaborations.createdAt,
    })
    .from(collaborations)
    .where(
      or(
        eq(collaborations.requesterUserId, userId),
        eq(collaborations.addresseeUserId, userId),
      ),
    )
    .orderBy(desc(collaborations.createdAt));

  if (rows.length === 0) return [];

  const partnerIds = rows.map((r) =>
    r.requesterUserId === userId ? r.addresseeUserId : r.requesterUserId,
  );
  const partners = await db
    .select({
      userId: userDirectory.userId,
      name: userDirectory.name,
      email: userDirectory.email,
    })
    .from(userDirectory)
    .where(inArray(userDirectory.userId, partnerIds));

  const byId = new Map(partners.map((p) => [p.userId, p]));

  return rows.map((r) => {
    const isRequester = r.requesterUserId === userId;
    const partnerId = isRequester ? r.addresseeUserId : r.requesterUserId;
    const partner = byId.get(partnerId);
    return {
      id: r.id,
      status: r.status,
      isRequester,
      partnerUserId: partnerId,
      partnerName: partner?.name ?? "(pengguna dihapus)",
      partnerEmail: partner?.email ?? "",
      createdAt: r.createdAt,
    };
  });
}

export async function findCollaborationBetween(
  a: string,
  b: string,
): Promise<{ id: string; status: string; requesterUserId: string } | null> {
  const [row] = await db
    .select({
      id: collaborations.id,
      status: collaborations.status,
      requesterUserId: collaborations.requesterUserId,
    })
    .from(collaborations)
    .where(
      or(
        and(
          eq(collaborations.requesterUserId, a),
          eq(collaborations.addresseeUserId, b),
        ),
        and(
          eq(collaborations.requesterUserId, b),
          eq(collaborations.addresseeUserId, a),
        ),
      ),
    );
  return row ?? null;
}

export async function insertCollaboration(
  requesterUserId: string,
  addresseeUserId: string,
) {
  await db.insert(collaborations).values({ requesterUserId, addresseeUserId });
}

/**
 * Memutus hubungan = menghapusnya dari database.
 *
 * Yang ikut terhapus:
 * - Baris hubungannya sendiri
 * - Seluruh entri dana (lewat ON DELETE CASCADE), berikut riwayat kantongnya
 * - Penandaan `funded_by_collaboration_id` pada transaksi KEDUA belah pihak
 *
 * Yang TIDAK terhapus: transaksi pemasukan & pengeluaran itu sendiri. Uangnya
 * benar-benar berpindah, jadi catatan itu milik masing-masing orang.
 *
 * Pembersihan penandaan dilakukan lintas tenant, dan itu disengaja: kolom
 * `funded_by_collaboration_id` tidak punya foreign key, jadi tanpa dibersihkan
 * transaksi pihak lawan akan menunjuk hubungan yang sudah tidak ada — kantong
 * mereka menghitung pengeluaran terhadap kredit yang sudah lenyap.
 */
export async function deleteCollaboration(
  userId: string,
  collaborationId: string,
) {
  // Hanya pihak yang terlibat yang boleh memutus.
  const [row] = await db
    .select({ id: collaborations.id })
    .from(collaborations)
    .where(
      and(
        eq(collaborations.id, collaborationId),
        or(
          eq(collaborations.requesterUserId, userId),
          eq(collaborations.addresseeUserId, userId),
        ),
      ),
    );
  if (!row) return;

  await db
    .update(transactions)
    .set({ fundedByCollaborationId: null })
    .where(eq(transactions.fundedByCollaborationId, collaborationId));

  await db.delete(collaborations).where(eq(collaborations.id, collaborationId));
}

/**
 * Menghidupkan kembali hubungan yang pernah diputus.
 *
 * Barisnya dipakai ulang, bukan dibuat baru, karena `unique(requester,
 * addressee)` akan menolak baris kedua untuk pasangan yang sama. Arah undangan
 * ikut ditulis ulang — yang mengundang kali ini belum tentu orang yang sama
 * dengan yang mengundang dulu.
 *
 * Entri dana lama sengaja TIDAK dihapus: uang yang pernah diberikan benar-benar
 * berpindah, dan riwayatnya tetap milik kedua pihak.
 */
export async function reopenCollaboration(
  collaborationId: string,
  requesterUserId: string,
  addresseeUserId: string,
) {
  await db
    .update(collaborations)
    .set({
      requesterUserId,
      addresseeUserId,
      status: "pending",
      respondedAt: null,
      createdAt: new Date().toISOString(),
    })
    .where(eq(collaborations.id, collaborationId));
}

/**
 * Mengubah status hubungan.
 *
 * Penyaringannya menuntut user termasuk salah satu pihak — tanpa itu, siapa pun
 * yang menebak sebuah id hubungan bisa menerima atau memutus kolaborasi orang.
 */
export async function updateCollaborationStatus(
  userId: string,
  collaborationId: string,
  status: "accepted" | "revoked",
  opts: { onlyAddressee?: boolean } = {},
) {
  const membership = opts.onlyAddressee
    ? eq(collaborations.addresseeUserId, userId)
    : or(
        eq(collaborations.requesterUserId, userId),
        eq(collaborations.addresseeUserId, userId),
      );

  await db
    .update(collaborations)
    .set({ status, respondedAt: new Date().toISOString() })
    .where(and(eq(collaborations.id, collaborationId), membership));
}

/** Entri kolaborasi yang melibatkan user ini (sebagai pemberi atau penerima). */
export async function listCollaborationEntries(
  userId: string,
): Promise<CollaborationEntry[]> {
  return db
    .select({
      id: collaborationEntries.id,
      collaborationId: collaborationEntries.collaborationId,
      fromUserId: collaborationEntries.fromUserId,
      toUserId: collaborationEntries.toUserId,
      amount: collaborationEntries.amount,
      occurredAt: collaborationEntries.occurredAt,
      note: collaborationEntries.note,
      status: collaborationEntries.status,
      senderTransactionId: collaborationEntries.senderTransactionId,
      recipientTransactionId: collaborationEntries.recipientTransactionId,
    })
    .from(collaborationEntries)
    .where(
      or(
        eq(collaborationEntries.fromUserId, userId),
        eq(collaborationEntries.toUserId, userId),
      ),
    )
    .orderBy(desc(collaborationEntries.occurredAt));
}

export async function insertCollaborationEntry(input: {
  collaborationId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  senderTransactionId: string | null;
}) {
  await db.insert(collaborationEntries).values(input);
}

export async function updateCollaborationEntry(
  userId: string,
  entryId: string,
  patch: {
    status?: "linked" | "accepted" | "rejected";
    recipientTransactionId?: string | null;
  },
) {
  // Hanya PENERIMA yang boleh mengubah status entri. Pemberi tidak boleh
  // menyatakan sendiri bahwa uangnya sudah diterima.
  await db
    .update(collaborationEntries)
    .set({ ...patch, resolvedAt: new Date().toISOString() })
    .where(
      and(
        eq(collaborationEntries.id, entryId),
        eq(collaborationEntries.toUserId, userId),
      ),
    );
}

/**
 * Menghapus entri dana — hanya boleh oleh PENGIRIMNYA.
 *
 * Penyaringan `fromUserId` itu bukan formalitas: tanpa itu, penerima bisa
 * menghapus catatan pemberian yang tidak menguntungkannya, dan pemberi
 * kehilangan jejak uang yang sudah dia keluarkan.
 *
 * Transaksi milik penerima TIDAK ikut disentuh. Uangnya benar-benar berpindah,
 * jadi catatan di bukunya adalah faktanya sendiri — yang hilang hanya
 * keterkaitannya dengan kantong kolaborasi.
 */
export async function deleteCollaborationEntry(
  userId: string,
  entryId: string,
) {
  await db
    .delete(collaborationEntries)
    .where(
      and(
        eq(collaborationEntries.id, entryId),
        eq(collaborationEntries.fromUserId, userId),
      ),
    );
}

export async function getCollaborationEntry(
  userId: string,
  entryId: string,
): Promise<CollaborationEntry | null> {
  const [row] = await db
    .select({
      id: collaborationEntries.id,
      collaborationId: collaborationEntries.collaborationId,
      fromUserId: collaborationEntries.fromUserId,
      toUserId: collaborationEntries.toUserId,
      amount: collaborationEntries.amount,
      occurredAt: collaborationEntries.occurredAt,
      note: collaborationEntries.note,
      status: collaborationEntries.status,
      senderTransactionId: collaborationEntries.senderTransactionId,
      recipientTransactionId: collaborationEntries.recipientTransactionId,
    })
    .from(collaborationEntries)
    .where(
      and(
        eq(collaborationEntries.id, entryId),
        or(
          eq(collaborationEntries.fromUserId, userId),
          eq(collaborationEntries.toUserId, userId),
        ),
      ),
    );
  return row ?? null;
}

/**
 * Ringkasan kantong per kolaborasi — tiga angka saja.
 *
 * ## Batas privasi
 *
 * Ini SATU-SATUNYA tempat data melintasi batas tenant, dan bentuknya sengaja
 * dibatasi: `spent` dihitung sebagai SUM di dalam SQL, sehingga baris transaksi
 * penerima tidak pernah keluar dari fungsi ini. Kalau baris mentahnya
 * dikembalikan lalu dijumlahkan di JavaScript, datanya sudah bocor ke payload
 * RSC pemberi meski tidak pernah dirender di layar.
 *
 * Konsekuensi yang disengaja: kalau penerima tidak menandai apa pun, dari sisi
 * pemberi uangnya terlihat utuh belum terpakai. Sistem tidak menebak.
 */
export async function getCollaborationSummaries(
  userId: string,
): Promise<CollaborationSummary[]> {
  const active = (await listCollaborations(userId)).filter(
    (c) => c.status === "accepted",
  );
  if (active.length === 0) return [];

  const ids = active.map((c) => c.id);

  const totals = await db
    .select({
      collaborationId: collaborationEntries.collaborationId,
      fromUserId: collaborationEntries.fromUserId,
      total: sql<number>`coalesce(sum(${collaborationEntries.amount}), 0)`,
    })
    .from(collaborationEntries)
    .where(
      and(
        inArray(collaborationEntries.collaborationId, ids),
        inArray(collaborationEntries.status, ["linked", "accepted"]),
      ),
    )
    .groupBy(
      collaborationEntries.collaborationId,
      collaborationEntries.fromUserId,
    );

  const pending = await db
    .select({
      collaborationId: collaborationEntries.collaborationId,
      count: sql<number>`count(*)`,
    })
    .from(collaborationEntries)
    .where(
      and(
        inArray(collaborationEntries.collaborationId, ids),
        eq(collaborationEntries.status, "pending_match"),
      ),
    )
    .groupBy(collaborationEntries.collaborationId);

  // Agregat lintas tenant — hanya jumlah, tidak pernah barisnya.
  const spends = await db
    .select({
      collaborationId: transactions.fundedByCollaborationId,
      spent: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.fundedByCollaborationId, ids),
        eq(transactions.direction, "out"),
      ),
    )
    .groupBy(transactions.fundedByCollaborationId);

  const pendingById = new Map(pending.map((p) => [p.collaborationId, p.count]));
  const spentById = new Map(spends.map((s) => [s.collaborationId, s.spent]));

  return active.map((c) => {
    const outbound = totals.find(
      (t) => t.collaborationId === c.id && t.fromUserId === userId,
    );
    const inbound = totals.find(
      (t) => t.collaborationId === c.id && t.fromUserId !== userId,
    );
    // Arah ditentukan oleh sisi mana yang punya dana tercatat. Kalau belum ada
    // sama sekali, anggap keluar — itu bentuk pemakaian yang paling umum.
    const direction: "in" | "out" = inbound && !outbound ? "in" : "out";
    const total = (direction === "out" ? outbound?.total : inbound?.total) ?? 0;
    const spent = spentById.get(c.id) ?? 0;

    return {
      collaborationId: c.id,
      partnerName: c.partnerName,
      partnerEmail: c.partnerEmail,
      direction,
      total,
      spent,
      remaining: total - spent,
      pendingCount: pendingById.get(c.id) ?? 0,
    };
  });
}

/** Transaksi masuk milik user yang belum terpakai entri kolaborasi manapun. */
export async function listLinkableIncome(
  userId: string,
): Promise<Transaction[]> {
  const linked = await db
    .select({ id: collaborationEntries.recipientTransactionId })
    .from(collaborationEntries)
    .where(ne(collaborationEntries.status, "rejected"));

  const usedIds = new Set(
    linked.map((l) => l.id).filter((v): v is string => Boolean(v)),
  );

  const income = await listTransactions(userId);
  return income.filter(
    (t) => t.direction === "in" && !t.isInternalTransfer && !usedIds.has(t.id),
  );
}

// ---------------------------------------------------------------------------
// Siklus hidup akun
// ---------------------------------------------------------------------------

/**
 * Menyiapkan data awal sebuah akun: kategori, status sumber, konfigurasi
 * ingestion. Wajib dipanggil untuk setiap user baru — tanpa ini akun tidak
 * punya kategori sama sekali dan halaman transaksi tidak bisa dipakai.
 *
 * Aman diulang: melewati langkah yang datanya sudah ada.
 */
export async function provisionNewUser(userId: string) {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(categories).values(
      SEED_CATEGORIES.map((c) => ({
        userId,
        name: c.name,
        kind: c.kind,
        sortOrder: c.sortOrder,
        isSystem: c.isSystem ?? false,
        systemKey: c.systemKey ?? null,
      })),
    );
  }

  await db
    .insert(sourceHealth)
    .values(
      SEED_SOURCE_HEALTH.map((s) => ({
        userId,
        source: s.source,
        emailSupported: s.emailSupported,
        note: s.note,
      })),
    )
    .onConflictDoNothing();

  await db.insert(ingestionConfig).values({ userId }).onConflictDoNothing();
}

/**
 * Menghapus seluruh data milik satu user.
 *
 * Dikerjakan eksplisit, bukan lewat ON DELETE CASCADE, karena tabel `user`
 * milik Better Auth dan tidak dideklarasikan di skema Drizzle — foreign key ke
 * sana tidak bisa dipasang tanpa membuat dua migrator berebut satu tabel.
 */
export async function deleteAllUserData(userId: string) {
  // Urutannya penting: baris yang menunjuk ke transaksi dihapus lebih dulu,
  // supaya foreign key tidak menolak penghapusan.
  //
  // Hubungan kolaborasi ikut dihapus, dan entri-entrinya terbawa lewat
  // ON DELETE CASCADE. Transaksi milik pihak lawan TIDAK ikut terhapus —
  // itu catatan keuangan yang sungguh terjadi di buku mereka.
  await db
    .delete(collaborations)
    .where(
      or(
        eq(collaborations.requesterUserId, userId),
        eq(collaborations.addresseeUserId, userId),
      ),
    );
  await db
    .delete(cashWalletEntries)
    .where(eq(cashWalletEntries.userId, userId));
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));
  await db.delete(ownAccounts).where(eq(ownAccounts.userId, userId));
  await db.delete(whatsappNumbers).where(eq(whatsappNumbers.userId, userId));
  await db.delete(sourceHealth).where(eq(sourceHealth.userId, userId));
  await db.delete(ingestionConfig).where(eq(ingestionConfig.userId, userId));
  await db.delete(syncState).where(eq(syncState.userId, userId));
  await db.delete(userDirectory).where(eq(userDirectory.userId, userId));
  // Kredensial Gmail wajib ikut terhapus. Membiarkannya berarti refresh token
  // terenkripsi milik akun yang sudah tidak ada tetap tersimpan selamanya —
  // rahasia yang tidak lagi punya pemilik untuk mencabutnya.
  await db
    .delete(gmailCredentials)
    .where(eq(gmailCredentials.userId, userId));
  // Konfirmasi tertunda juga. Kalau tertinggal, balasan "YA" berikutnya dari
  // nomor yang sama bisa mengeksekusi aksi milik akun yang sudah tidak ada.
  await db
    .delete(waPendingConfirmations)
    .where(eq(waPendingConfirmations.userId, userId));
}

export interface UserOperationalStats {
  userId: string;
  transactionCount: number;
  lastActivityAt: string | null;
  ingestionEnabled: boolean;
  ingestionConfigured: boolean;
  lastPolledAt: string | null;
  inboxEmail: string;
  collaborationCount: number;
}

/**
 * Statistik operasional seluruh user untuk dashboard admin.
 *
 * Dikerjakan sebagai agregat, bukan dengan mengambil transaksinya lalu
 * menghitung di JavaScript. Ini bukan sekadar soal kecepatan: admin tidak perlu
 * — dan tidak boleh — melihat isi transaksi siapa pun. Yang keluar dari sini
 * hanya jumlah dan tanggal.
 */
export async function getAllUserStats(): Promise<UserOperationalStats[]> {
  const txStats = await db
    .select({
      userId: transactions.userId,
      count: sql<number>`count(*)`,
      lastActivity: sql<string | null>`max(${transactions.occurredAt})`,
    })
    .from(transactions)
    .groupBy(transactions.userId);

  const configs = await db
    .select({
      userId: ingestionConfig.userId,
      enabled: ingestionConfig.enabled,
      inboxEmail: ingestionConfig.inboxEmail,
      lastPolledAt: ingestionConfig.lastPolledAt,
    })
    .from(ingestionConfig);

  const collabCounts = await db
    .select({
      userId: collaborations.requesterUserId,
      count: sql<number>`count(*)`,
    })
    .from(collaborations)
    .where(eq(collaborations.status, "accepted"))
    .groupBy(collaborations.requesterUserId);

  const collabCountsIn = await db
    .select({
      userId: collaborations.addresseeUserId,
      count: sql<number>`count(*)`,
    })
    .from(collaborations)
    .where(eq(collaborations.status, "accepted"))
    .groupBy(collaborations.addresseeUserId);

  const txById = new Map(txStats.map((t) => [t.userId, t]));
  const collabById = new Map<string, number>();
  for (const row of [...collabCounts, ...collabCountsIn]) {
    collabById.set(row.userId, (collabById.get(row.userId) ?? 0) + row.count);
  }

  return configs.map((c) => {
    const tx = txById.get(c.userId);
    return {
      userId: c.userId,
      transactionCount: tx?.count ?? 0,
      lastActivityAt: tx?.lastActivity ?? null,
      ingestionEnabled: c.enabled,
      // Inbox yang masih berisi nilai contoh berarti belum benar-benar disetel.
      ingestionConfigured:
        c.inboxEmail.length > 0 && !c.inboxEmail.startsWith("ganti-dengan"),
      lastPolledAt: c.lastPolledAt,
      inboxEmail: c.inboxEmail,
      collaborationCount: collabById.get(c.userId) ?? 0,
    };
  });
}

/** Angka ringkas seluruh instalasi. */
export async function getInstanceStats() {
  const [tx] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions);
  const [collab] = await db
    .select({ count: sql<number>`count(*)` })
    .from(collaborations)
    .where(eq(collaborations.status, "accepted"));
  const [ingestionOn] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ingestionConfig)
    .where(eq(ingestionConfig.enabled, true));

  return {
    totalTransactions: tx?.count ?? 0,
    activeCollaborations: collab?.count ?? 0,
    usersWithIngestion: ingestionOn?.count ?? 0,
  };
}
