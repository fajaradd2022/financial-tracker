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

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Tidak terautentikasi.");
  return session;
}

/** Semua halaman berbagi data yang sama, jadi cukup segarkan dari root. */
function refreshAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Transaksi
// ---------------------------------------------------------------------------

export async function createTransactionAction(input: Omit<Transaction, "id">) {
  await requireSession();
  const id = await repo.insertTransaction(input);
  refreshAll();
  return id;
}

export async function updateTransactionAction(
  id: string,
  patch: Partial<Omit<Transaction, "id">>,
) {
  await requireSession();
  await repo.updateTransaction(id, patch);
  refreshAll();
}

export async function deleteTransactionAction(id: string) {
  await requireSession();
  await repo.deleteTransaction(id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Kategori
// ---------------------------------------------------------------------------

export async function createCategoryAction(input: Omit<Category, "id">) {
  await requireSession();
  await repo.insertCategory(input);
  refreshAll();
}

export async function updateCategoryAction(
  id: string,
  patch: Partial<Omit<Category, "id">>,
) {
  await requireSession();
  await repo.updateCategory(id, patch);
  refreshAll();
}

export async function deleteCategoryAction(id: string) {
  await requireSession();
  await repo.deleteCategory(id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Rekening sendiri
// ---------------------------------------------------------------------------

export async function createOwnAccountAction(input: Omit<OwnAccount, "id">) {
  await requireSession();
  await repo.insertOwnAccount(input);
  refreshAll();
}

export async function updateOwnAccountAction(
  id: string,
  patch: Partial<Omit<OwnAccount, "id">>,
) {
  await requireSession();
  await repo.updateOwnAccount(id, patch);
  refreshAll();
}

export async function deleteOwnAccountAction(id: string) {
  await requireSession();
  await repo.deleteOwnAccount(id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// Dompet tunai
// ---------------------------------------------------------------------------

export async function createCashEntryAction(
  input: Omit<CashWalletEntry, "id">,
) {
  await requireSession();
  await repo.insertCashEntry(input);
  refreshAll();
}

export async function updateCashEntryAction(
  id: string,
  patch: Partial<Omit<CashWalletEntry, "id">>,
) {
  await requireSession();
  await repo.updateCashEntry(id, patch);
  refreshAll();
}

export async function deleteCashEntryAction(id: string) {
  await requireSession();
  await repo.deleteCashEntry(id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// WhatsApp & ingestion
// ---------------------------------------------------------------------------

export async function createWhatsAppNumberAction(
  input: Omit<WhatsAppNumber, "id">,
) {
  await requireSession();
  await repo.insertWhatsAppNumber(input);
  refreshAll();
}

export async function updateWhatsAppNumberAction(
  id: string,
  patch: Partial<Omit<WhatsAppNumber, "id">>,
) {
  await requireSession();
  await repo.updateWhatsAppNumber(id, patch);
  refreshAll();
}

export async function deleteWhatsAppNumberAction(id: string) {
  await requireSession();
  await repo.deleteWhatsAppNumber(id);
  refreshAll();
}

export async function updateIngestionConfigAction(
  patch: Partial<IngestionConfig>,
) {
  await requireSession();
  await repo.updateIngestionConfig(patch);
  refreshAll();
}
