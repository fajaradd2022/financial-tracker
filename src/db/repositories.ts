import { asc, desc, eq } from "drizzle-orm";
import { db } from "./connection";
import {
  cashWalletEntries,
  categories,
  ingestionConfig,
  ownAccounts,
  sourceHealth,
  transactions,
  whatsappNumbers,
} from "./schema";
import type {
  CashWalletEntry,
  Category,
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
 * Semua fungsi mengembalikan bentuk yang sama persis dengan tipe domain di
 * `lib/types.ts`, bukan baris mentah Drizzle. Dengan begitu lapisan UI tidak
 * pernah bergantung pada detail skema, dan pergantian database nanti (mis. ke
 * Postgres) berhenti di berkas ini.
 */

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export async function listTransactions(): Promise<Transaction[]> {
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
    })
    .from(transactions)
    .orderBy(desc(transactions.occurredAt));
}

export async function listCategories(): Promise<Category[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      isSystem: categories.isSystem,
      isActive: categories.isActive,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.kind), asc(categories.sortOrder));
}

export async function listOwnAccounts(): Promise<OwnAccount[]> {
  return db
    .select({
      id: ownAccounts.id,
      owner: ownAccounts.owner,
      bank: ownAccounts.bank,
      accountNumberOrIdentifier: ownAccounts.accountNumberOrIdentifier,
      label: ownAccounts.label,
      isActive: ownAccounts.isActive,
    })
    .from(ownAccounts)
    .orderBy(asc(ownAccounts.owner), asc(ownAccounts.label));
}

export async function listCashEntries(): Promise<CashWalletEntry[]> {
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
    .orderBy(desc(cashWalletEntries.occurredAt));
}

export async function listWhatsAppNumbers(): Promise<WhatsAppNumber[]> {
  return db
    .select({
      id: whatsappNumbers.id,
      phoneE164: whatsappNumbers.phoneE164,
      label: whatsappNumbers.label,
      isActive: whatsappNumbers.isActive,
    })
    .from(whatsappNumbers)
    .orderBy(asc(whatsappNumbers.label));
}

export async function listSourceHealth(): Promise<SourceHealth[]> {
  return db
    .select({
      source: sourceHealth.source,
      emailSupported: sourceHealth.emailSupported,
      lastSeenAt: sourceHealth.lastSeenAt,
      note: sourceHealth.note,
    })
    .from(sourceHealth);
}

export async function getIngestionConfig(): Promise<IngestionConfig> {
  const [row] = await db
    .select({
      inboxEmail: ingestionConfig.inboxEmail,
      pollIntervalMinutes: ingestionConfig.pollIntervalMinutes,
      backfillEnabled: ingestionConfig.backfillEnabled,
      enabled: ingestionConfig.enabled,
      lastPolledAt: ingestionConfig.lastPolledAt,
    })
    .from(ingestionConfig)
    .where(eq(ingestionConfig.id, "singleton"));

  // Baris singleton dibuat saat db:setup. Kalau hilang, tampilkan default yang
  // aman (ingestion mati) daripada melempar dan menjatuhkan seluruh halaman.
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

// ---------------------------------------------------------------------------
// Tulis — transaksi
// ---------------------------------------------------------------------------

export type NewTransactionInput = Omit<Transaction, "id">;

export async function insertTransaction(
  input: NewTransactionInput,
): Promise<string> {
  const [row] = await db
    .insert(transactions)
    .values(input)
    .returning({ id: transactions.id });
  return row.id;
}

export async function updateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, "id">>,
) {
  await db
    .update(transactions)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(transactions.id, id));
}

export async function deleteTransaction(id: string) {
  // Baris dompet tunai yang lahir dari transaksi ini ikut terhapus lewat
  // ON DELETE CASCADE, jadi saldo tidak lagi menghitung tarik tunai yang
  // sumbernya sudah tiada.
  await db.delete(transactions).where(eq(transactions.id, id));
}

// ---------------------------------------------------------------------------
// Tulis — kategori
// ---------------------------------------------------------------------------

export async function insertCategory(input: Omit<Category, "id">) {
  await db.insert(categories).values(input);
}

export async function updateCategory(
  id: string,
  patch: Partial<Omit<Category, "id">>,
) {
  await db.update(categories).set(patch).where(eq(categories.id, id));
}

export async function deleteCategory(id: string) {
  await db.delete(categories).where(eq(categories.id, id));
}

// ---------------------------------------------------------------------------
// Tulis — rekening sendiri
// ---------------------------------------------------------------------------

export async function insertOwnAccount(input: Omit<OwnAccount, "id">) {
  await db.insert(ownAccounts).values(input);
}

export async function updateOwnAccount(
  id: string,
  patch: Partial<Omit<OwnAccount, "id">>,
) {
  await db.update(ownAccounts).set(patch).where(eq(ownAccounts.id, id));
}

export async function deleteOwnAccount(id: string) {
  await db.delete(ownAccounts).where(eq(ownAccounts.id, id));
}

// ---------------------------------------------------------------------------
// Tulis — dompet tunai
// ---------------------------------------------------------------------------

export async function insertCashEntry(input: Omit<CashWalletEntry, "id">) {
  await db.insert(cashWalletEntries).values(input);
}

export async function updateCashEntry(
  id: string,
  patch: Partial<Omit<CashWalletEntry, "id">>,
) {
  await db
    .update(cashWalletEntries)
    .set(patch)
    .where(eq(cashWalletEntries.id, id));
}

export async function deleteCashEntry(id: string) {
  await db.delete(cashWalletEntries).where(eq(cashWalletEntries.id, id));
}

// ---------------------------------------------------------------------------
// Tulis — WhatsApp & ingestion
// ---------------------------------------------------------------------------

export async function insertWhatsAppNumber(input: Omit<WhatsAppNumber, "id">) {
  await db.insert(whatsappNumbers).values(input);
}

export async function updateWhatsAppNumber(
  id: string,
  patch: Partial<Omit<WhatsAppNumber, "id">>,
) {
  await db.update(whatsappNumbers).set(patch).where(eq(whatsappNumbers.id, id));
}

export async function deleteWhatsAppNumber(id: string) {
  await db.delete(whatsappNumbers).where(eq(whatsappNumbers.id, id));
}

export async function updateIngestionConfig(patch: Partial<IngestionConfig>) {
  await db
    .update(ingestionConfig)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(ingestionConfig.id, "singleton"));
}
