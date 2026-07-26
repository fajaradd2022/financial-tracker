"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import type {
  CashWalletEntry,
  Category,
  IngestionConfig,
  OwnAccount,
  Transaction,
  WhatsAppNumber,
} from "@/lib/types";

/**
 * Server action untuk seluruh mutasi data.
 *
 * Setiap action memverifikasi sesi lebih dulu. Ini bukan pengulangan yang
 * mubazir dari penjagaan di layout: server action adalah endpoint HTTP
 * tersendiri yang bisa dipanggil langsung, jadi ia harus menjaga dirinya
 * sendiri — tidak boleh mengandalkan halaman mana yang memanggilnya.
 */

/**
 * Mengembalikan id user pemilik sesi.
 *
 * userId SELALU berasal dari sini, tidak pernah dari argumen action. Argumen
 * dikirim dari browser dan bisa dipalsukan; sesi tidak.
 */
async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Tidak terautentikasi.");
  return session.user.id;
}

/** Semua halaman berbagi data yang sama, jadi cukup segarkan dari root. */
function refreshAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Transaksi
// ---------------------------------------------------------------------------

export async function createTransactionAction(input: repo.NewTransactionInput) {
  const userId = await requireUserId();
  const id = await repo.insertTransaction(userId, input);
  refreshAll();
  return id;
}

export async function updateTransactionAction(
  id: string,
  patch: Partial<Omit<Transaction, "id">>,
) {
  const userId = await requireUserId();
  await repo.updateTransaction(userId, id, patch);
  refreshAll();
}

export async function deleteTransactionAction(id: string) {
  const userId = await requireUserId();
  await repo.deleteTransaction(userId, id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Kategori
// ---------------------------------------------------------------------------

export async function createCategoryAction(input: Omit<Category, "id">) {
  const userId = await requireUserId();
  await repo.insertCategory(userId, input);
  refreshAll();
}

export async function updateCategoryAction(
  id: string,
  patch: Partial<Omit<Category, "id">>,
) {
  const userId = await requireUserId();
  await repo.updateCategory(userId, id, patch);
  refreshAll();
}

export async function deleteCategoryAction(id: string) {
  const userId = await requireUserId();
  await repo.deleteCategory(userId, id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Rekening sendiri
// ---------------------------------------------------------------------------

export async function createOwnAccountAction(input: Omit<OwnAccount, "id">) {
  const userId = await requireUserId();
  await repo.insertOwnAccount(userId, input);
  refreshAll();
}

export async function updateOwnAccountAction(
  id: string,
  patch: Partial<Omit<OwnAccount, "id">>,
) {
  const userId = await requireUserId();
  await repo.updateOwnAccount(userId, id, patch);
  refreshAll();
}

export async function deleteOwnAccountAction(id: string) {
  const userId = await requireUserId();
  await repo.deleteOwnAccount(userId, id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Dompet tunai
// ---------------------------------------------------------------------------

export async function createCashEntryAction(
  input: Omit<CashWalletEntry, "id">,
) {
  const userId = await requireUserId();
  await repo.insertCashEntry(userId, input);
  refreshAll();
}

export async function updateCashEntryAction(
  id: string,
  patch: Partial<Omit<CashWalletEntry, "id">>,
) {
  const userId = await requireUserId();
  await repo.updateCashEntry(userId, id, patch);
  refreshAll();
}

export async function deleteCashEntryAction(id: string) {
  const userId = await requireUserId();
  await repo.deleteCashEntry(userId, id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// WhatsApp & ingestion
// ---------------------------------------------------------------------------

export async function createWhatsAppNumberAction(
  input: Omit<WhatsAppNumber, "id">,
) {
  const userId = await requireUserId();
  await repo.insertWhatsAppNumber(userId, input);
  refreshAll();
}

export async function updateWhatsAppNumberAction(
  id: string,
  patch: Partial<Omit<WhatsAppNumber, "id">>,
) {
  const userId = await requireUserId();
  await repo.updateWhatsAppNumber(userId, id, patch);
  refreshAll();
}

export async function deleteWhatsAppNumberAction(id: string) {
  const userId = await requireUserId();
  await repo.deleteWhatsAppNumber(userId, id);
  refreshAll();
}

export async function updateIngestionConfigAction(
  patch: Partial<IngestionConfig>,
) {
  const userId = await requireUserId();
  await repo.updateIngestionConfig(userId, patch);
  refreshAll();
}
