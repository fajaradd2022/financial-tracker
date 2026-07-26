import * as repo from "@/db/repositories";
import { isCashWithdrawal, withdrawalCreditFor } from "@/lib/domain/cash-wallet";
import { matchInternalTransfer } from "@/lib/domain/internal-transfer";
import type { GmailMessage } from "@/lib/gmail/client";
import { resolveSource } from "@/lib/gmail/source-mapping";
import {
  categorizeTransaction,
  findSystemCategory,
} from "@/lib/llm/categorize";
import { extractTransaction, type CompletionFn } from "@/lib/llm/extract";
import type { ReviewReason, Transaction } from "@/lib/types";

/**
 * Pipeline: satu email -> satu baris transaksi (+ baris dompet tunai kalau
 * email itu tarik tunai).
 *
 * Prinsip yang dipegang di seluruh berkas ini: **tidak ada email yang hilang
 * diam-diam.** Email yang gagal diekstrak tetap disimpan sebagai transaksi
 * ber-confidence rendah dan ditandai perlu direview, karena transaksi yang
 * tercatat salah masih bisa dilihat dan dikoreksi, sedangkan transaksi yang
 * tidak pernah muncul tidak akan pernah disadari hilang.
 *
 * Semuanya berjalan dalam konteks satu user — `userId` diteruskan ke setiap
 * pemanggilan repository, tidak ada kueri global.
 */

export const SYNC_CURSOR_KEY = "gmail:last_polled_at";

export interface IngestOutcome {
  status: "inserted" | "skipped_duplicate" | "skipped_not_transaction";
  transactionId?: string;
  reason?: string;
}

export interface IngestDeps {
  /** Disuntik saat pengujian agar pipeline diuji tanpa memanggil API LLM. */
  completion?: CompletionFn;
  /** Nama pemilik rekening untuk pencocokan nama cadangan. */
  ownerNames?: string[];
}

/** Cuplikan isi email untuk audit — cukup untuk mengenali, tanpa menggemukkan DB. */
function snippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 500);
}

/**
 * Memproses satu email Gmail menjadi transaksi milik `userId`.
 *
 * Aman dipanggil ulang untuk email yang sama: pemeriksaan idempotensi plus
 * unique constraint `(user_id, gmail_message_id)` membuat polling yang
 * jendelanya tumpang tindih tidak menghasilkan duplikat.
 */
export async function ingestMessage(
  userId: string,
  message: GmailMessage,
  deps: IngestDeps = {},
): Promise<IngestOutcome> {
  if (await repo.transactionExistsForMessage(userId, message.id)) {
    return { status: "skipped_duplicate" };
  }

  const source = resolveSource(message.senderAddress) ?? "manual_other";

  const { result, error } = await extractTransaction(
    {
      source,
      senderAddress: message.senderAddress,
      subject: message.subject,
      body: message.body,
    },
    deps.completion,
  );

  // Email non-transaksi (promosi, OTP) memang tidak perlu jadi baris apa pun.
  // Ini satu-satunya kasus di mana email sengaja dibuang.
  if (result.isTransactionEmail && !error && result.amount && result.direction) {
    return insertExtracted(userId, message, source, result, deps);
  }

  if (!result.isTransactionEmail && !error) {
    return { status: "skipped_not_transaction" };
  }

  // Ekstraksi gagal atau datanya tidak lengkap: tetap dicatat supaya terlihat.
  const occurredAt = result.occurredAt
    ? new Date(result.occurredAt).toISOString()
    : new Date(Number(message.internalDate)).toISOString();

  const id = await repo.insertTransaction(userId, {
    source,
    direction: result.direction ?? "out",
    amount: result.amount ?? 0,
    occurredAt,
    counterpartyName: result.counterpartyName ?? message.subject,
    counterpartyAccountNumber: result.counterpartyAccountNumber,
    rawTransactionType: result.rawTransactionType,
    origin: "email",
    gmailMessageId: message.id,
    rawEmailSnippet: snippet(message.body),
    extractionConfidence: "low",
    categoryId: null,
    isInternalTransfer: false,
    internalTransferMatchType: null,
    needsReview: true,
    reviewReason: "low_confidence_extraction",
  });

  return {
    status: "inserted",
    transactionId: id,
    reason: error ?? "Data hasil ekstraksi tidak lengkap.",
  };
}

async function insertExtracted(
  userId: string,
  message: GmailMessage,
  source: Transaction["source"],
  result: {
    direction: "in" | "out" | null;
    amount: number | null;
    counterpartyName: string | null;
    counterpartyAccountNumber: string | null;
    occurredAt: string | null;
    rawTransactionType: string | null;
    confidence: "high" | "low";
  },
  deps: IngestDeps,
): Promise<IngestOutcome> {
  const [ownAccounts, categories] = await Promise.all([
    repo.listOwnAccounts(userId),
    repo.listCategories(userId),
  ]);

  const direction = result.direction!;
  const amount = result.amount!;
  const occurredAt = result.occurredAt
    ? new Date(result.occurredAt).toISOString()
    : new Date(Number(message.internalDate)).toISOString();

  // 1. Transfer antar rekening SENDIRI — cakupannya kini hanya rekening milik
  //    user ini. Rekening pasangan/kolaborator sudah tidak masuk sini, jadi
  //    transfer ke sana memang terhitung pengeluaran.
  const internal = matchInternalTransfer({
    counterpartyAccountNumber: result.counterpartyAccountNumber,
    counterpartyName: result.counterpartyName,
    ownAccounts,
    ownerNames: deps.ownerNames ?? ownerNamesFromEnv(),
  });

  // 2. Kategori.
  const withdrawal = isCashWithdrawal({
    rawTransactionType: result.rawTransactionType,
    direction,
  });

  let categoryId: string | null = null;
  let categoryNeedsReview = false;

  if (internal.isInternal) {
    // Transfer internal tidak masuk hitungan pemasukan/pengeluaran, jadi
    // kategori tidak punya arti — memanggil LLM di sini hanya buang biaya.
    categoryId = null;
  } else if (withdrawal) {
    // Aturan tetap: tarik tunai selalu "Cash Expense". Tidak perlu LLM.
    categoryId = findSystemCategory(categories, "cash_expense")?.id ?? null;
  } else {
    const categorized = await categorizeTransaction(
      {
        direction,
        amount,
        counterpartyName: result.counterpartyName,
        rawTransactionType: result.rawTransactionType,
      },
      categories,
      deps.completion,
    );
    categoryId = categorized.categoryId;
    categoryNeedsReview = categorized.needsReview;
  }

  // 3. Alasan review — diurutkan dari yang paling penting diketahui manusia.
  let reviewReason: ReviewReason | null = null;
  if (result.confidence === "low") reviewReason = "low_confidence_extraction";
  else if (internal.needsReview) reviewReason = "fuzzy_internal_match";
  else if (categoryNeedsReview || (!categoryId && !internal.isInternal))
    reviewReason = "uncategorized";

  const transactionId = await repo.insertTransaction(userId, {
    source,
    direction,
    amount,
    occurredAt,
    counterpartyName: result.counterpartyName,
    counterpartyAccountNumber: result.counterpartyAccountNumber,
    rawTransactionType: result.rawTransactionType,
    origin: "email",
    gmailMessageId: message.id,
    rawEmailSnippet: snippet(message.body),
    extractionConfidence: result.confidence,
    categoryId,
    isInternalTransfer: internal.isInternal,
    internalTransferMatchType: internal.matchType,
    needsReview: reviewReason !== null,
    reviewReason,
  });

  // 4. Tarik tunai menambah saldo dompet tunai. Transfer internal dikecualikan:
  //    memindahkan dana antar rekening sendiri bukan penarikan uang fisik.
  if (withdrawal && !internal.isInternal) {
    await repo.insertCashEntry(
      userId,
      withdrawalCreditFor({
        id: transactionId,
        amount,
        occurredAt,
        counterpartyName: result.counterpartyName,
      }),
    );
  }

  return { status: "inserted", transactionId };
}

/**
 * Nama pemilik rekening untuk pencocokan nama cadangan.
 *
 * Masih dari env sebagai nilai awal bersama; saat Fase C nanti tiap user punya
 * profilnya sendiri, sumbernya pindah ke database dan parameter `ownerNames`
 * di `IngestDeps` yang dipakai.
 */
export function ownerNamesFromEnv(): string[] {
  return (process.env.OWNER_ACCOUNT_NAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
