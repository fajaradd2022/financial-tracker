import type { CashWalletEntry, Transaction } from "@/lib/types";

/**
 * Aturan dompet tunai.
 *
 * Tarik tunai bukan pengeluaran final: uangnya berpindah dari rekening ke
 * dompet fisik, dan baru jelas dipakai untuk apa setelah dicatat manual.
 * Karena itu setiap tarik tunai menaikkan saldo dompet, dan catatan manual
 * menurunkannya. Selisihnya = uang tunai yang belum dijelaskan.
 */

/** Kata kunci yang muncul di label transaksi bank untuk penarikan tunai. */
const WITHDRAWAL_PATTERNS = [
  "tarik tunai",
  "penarikan tunai",
  "atm withdrawal",
  "cash withdrawal",
  "tunai atm",
];

/**
 * Mengenali tarik tunai dari label mentah bank.
 *
 * Sengaja dipisah jadi fungsi tersendiri karena aturan ini dipakai di dua
 * tempat yang harus selalu sepakat: pipeline ingestion (untuk membuat baris
 * dompet tunai) dan ringkasan di UI. Kalau keduanya punya definisi sendiri,
 * saldo dompet bisa tidak cocok dengan angka "tarik tunai" di dashboard.
 */
export function isCashWithdrawal(transaction: {
  rawTransactionType: string | null;
  direction: string;
}): boolean {
  if (transaction.direction !== "out") return false;
  const raw = (transaction.rawTransactionType ?? "").toLowerCase();
  if (!raw) return false;
  return WITHDRAWAL_PATTERNS.some((pattern) => raw.includes(pattern));
}

/**
 * Saldo dompet tunai dihitung dari seluruh baris, bukan disimpan sebagai angka
 * berjalan. Dengan begitu koreksi atau penghapusan satu catatan otomatis benar
 * tanpa perlu penulisan penyeimbang — penting karena kanal WhatsApp nanti
 * mengizinkan edit & hapus.
 */
export function computeCashBalance(entries: CashWalletEntry[]): number {
  return entries.reduce(
    (sum, entry) =>
      entry.entryType === "manual_expense_debit"
        ? sum - entry.amount
        : sum + entry.amount,
    0,
  );
}

/** Baris dompet tunai yang harus dibuat saat sebuah tarik tunai masuk. */
export function withdrawalCreditFor(
  transaction: Pick<Transaction, "id" | "amount" | "occurredAt" | "counterpartyName">,
): Omit<CashWalletEntry, "id"> {
  return {
    entryType: "withdrawal_credit",
    amount: transaction.amount,
    transactionId: transaction.id,
    categoryId: null,
    note: transaction.counterpartyName ?? "Tarik tunai",
    occurredAt: transaction.occurredAt,
    origin: "email",
  };
}
