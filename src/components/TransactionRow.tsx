"use client";

import Link from "next/link";
import {
  formatDate,
  formatIDR,
  REVIEW_REASON_LABEL,
  SOURCE_LABEL,
  SOURCE_STYLE,
} from "@/lib/format";
import type { Category, Transaction } from "@/lib/types";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconSwap,
} from "./icons";
import { Badge, cn } from "./ui";

/**
 * Satu baris transaksi. Dipakai di dashboard (5 terbaru) dan di daftar penuh.
 *
 * Aturan tampilan yang penting: transfer internal TIDAK diwarnai merah/hijau
 * seperti pengeluaran/pemasukan, karena secara arti bukan keduanya — uangnya
 * hanya pindah kantong. Warnanya netral supaya mata tidak salah membacanya
 * sebagai pengeluaran.
 */
export function TransactionRow({
  transaction,
  category,
}: {
  transaction: Transaction;
  category?: Category;
}) {
  const { direction, isInternalTransfer, needsReview } = transaction;
  const isIncome = direction === "in" && !isInternalTransfer;
  const isExpense = direction === "out" && !isInternalTransfer;

  return (
    <Link
      href={`/transactions/${transaction.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/60 sm:px-5"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          isInternalTransfer
            ? "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400"
            : isIncome
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
        )}
      >
        {isInternalTransfer ? (
          <IconSwap />
        ) : isIncome ? (
          <IconArrowDownLeft />
        ) : (
          <IconArrowUpRight />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">
            {transaction.counterpartyName ?? "Tanpa keterangan"}
          </p>
          {needsReview ? (
            <Badge tone="warning" className="shrink-0">
              Review
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              SOURCE_STYLE[transaction.source],
            )}
          >
            {SOURCE_LABEL[transaction.source]}
          </span>
          <span>{formatDate(transaction.occurredAt)}</span>
          {isInternalTransfer ? (
            <span className="text-slate-500 dark:text-slate-400">
              · Transfer internal
            </span>
          ) : category ? (
            <span>· {category.name}</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              · Belum berkategori
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "tabular text-sm font-semibold",
            isInternalTransfer
              ? "text-muted"
              : isIncome
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-foreground",
          )}
        >
          {isExpense ? "−" : isIncome ? "+" : ""}
          {formatIDR(transaction.amount)}
        </p>
        {needsReview && transaction.reviewReason ? (
          <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
            {REVIEW_REASON_LABEL[transaction.reviewReason]}
          </p>
        ) : isInternalTransfer ? (
          <p className="mt-0.5 text-[10px] text-muted">tidak dihitung</p>
        ) : null}
      </div>
    </Link>
  );
}
