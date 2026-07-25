"use client";

import writeXlsxFile from "write-excel-file/browser";
import { dayKey, ORIGIN_LABEL, SOURCE_LABEL } from "./format";
import type { CashWalletEntry, Category, Transaction } from "./types";

/**
 * Ekspor ke .xlsx.
 *
 * Nominal ditulis sebagai angka (bukan teks "Rp1.500.000") supaya bisa langsung
 * dijumlahkan di Excel; tampilannya diserahkan ke `format` sel. Tanggal ditulis
 * sebagai teks YYYY-MM-DD zona WIB agar Excel tidak menggesernya lagi mengikuti
 * zona waktu komputer yang membukanya.
 */

const MONEY = "#,##0";

const text = (value: string) => ({ type: String, value }) as const;
const money = (value: number | undefined) =>
  ({ type: Number, value, format: MONEY }) as const;

function fileStamp(): string {
  return dayKey(new Date().toISOString());
}

export async function exportTransactionsToExcel(
  rows: Transaction[],
  categories: Category[],
  periodLabel: string,
) {
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "";

  await writeXlsxFile(rows, {
    sheet: "Transaksi",
    columns: [
      {
        header: "Tanggal",
        width: 12,
        cell: (t) => text(dayKey(t.occurredAt)),
      },
      {
        header: "Jenis",
        width: 16,
        cell: (t) =>
          text(
            t.isInternalTransfer
              ? "Transfer internal"
              : t.direction === "in"
                ? "Pemasukan"
                : "Pengeluaran",
          ),
      },
      { header: "Sumber", width: 12, cell: (t) => text(SOURCE_LABEL[t.source]) },
      {
        header: "Lawan transaksi",
        width: 32,
        cell: (t) => text(t.counterpartyName ?? ""),
      },
      {
        header: "Kategori",
        width: 20,
        cell: (t) => text(categoryName(t.categoryId)),
      },
      {
        // Dikosongkan untuk transfer internal supaya SUM kolom ini langsung
        // menghasilkan total pemasukan/pengeluaran yang benar.
        header: "Pemasukan",
        width: 16,
        cell: (t) =>
          money(
            !t.isInternalTransfer && t.direction === "in" ? t.amount : undefined,
          ),
      },
      {
        header: "Pengeluaran",
        width: 16,
        cell: (t) =>
          money(
            !t.isInternalTransfer && t.direction === "out"
              ? t.amount
              : undefined,
          ),
      },
      {
        header: "Transfer internal",
        width: 18,
        cell: (t) => money(t.isInternalTransfer ? t.amount : undefined),
      },
      {
        header: "Keterangan",
        width: 24,
        cell: (t) => text(t.rawTransactionType ?? ""),
      },
      {
        header: "No. rekening lawan",
        width: 20,
        cell: (t) => text(t.counterpartyAccountNumber ?? ""),
      },
      {
        header: "Asal data",
        width: 14,
        cell: (t) => text(ORIGIN_LABEL[t.origin]),
      },
      {
        header: "Perlu review",
        width: 14,
        cell: (t) => text(t.needsReview ? "Ya" : ""),
      },
      { header: "Periode", width: 18, cell: () => text(periodLabel) },
    ],
  }).toFile(`transaksi-${fileStamp()}.xlsx`);
}

export async function exportCashEntriesToExcel(
  rows: CashWalletEntry[],
  categories: Category[],
  periodLabel: string,
) {
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "";

  await writeXlsxFile(rows, {
    sheet: "Dompet Tunai",
    columns: [
      {
        header: "Tanggal",
        width: 12,
        cell: (e) => text(dayKey(e.occurredAt)),
      },
      {
        header: "Jenis",
        width: 20,
        cell: (e) =>
          text(
            e.entryType === "manual_expense_debit"
              ? "Pengeluaran tunai"
              : e.entryType === "withdrawal_credit"
                ? "Tarik tunai"
                : "Pemasukan tunai",
          ),
      },
      { header: "Keterangan", width: 32, cell: (e) => text(e.note ?? "") },
      {
        header: "Kategori",
        width: 20,
        cell: (e) => text(categoryName(e.categoryId)),
      },
      {
        header: "Masuk",
        width: 16,
        cell: (e) =>
          money(
            e.entryType === "manual_expense_debit" ? undefined : e.amount,
          ),
      },
      {
        header: "Keluar",
        width: 16,
        cell: (e) =>
          money(
            e.entryType === "manual_expense_debit" ? e.amount : undefined,
          ),
      },
      {
        header: "Asal data",
        width: 14,
        cell: (e) => text(ORIGIN_LABEL[e.origin]),
      },
      { header: "Periode", width: 18, cell: () => text(periodLabel) },
    ],
  }).toFile(`dompet-tunai-${fileStamp()}.xlsx`);
}
