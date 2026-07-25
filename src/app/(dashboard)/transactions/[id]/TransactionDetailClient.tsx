"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/Modal";
import { IconChevronLeft, IconTrash } from "@/components/icons";
import {
  AmountInput,
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  Field,
  Input,
  Select,
  Toggle,
} from "@/components/ui";
import {
  formatDateTime,
  formatIDR,
  formatNumber,
  fromDateInputValue,
  ORIGIN_LABEL,
  parseAmountInput,
  REVIEW_REASON_LABEL,
  SOURCE_LABEL,
  SOURCE_STYLE,
  toDateInputValue,
} from "@/lib/format";
import { useStore } from "@/lib/store";

export function TransactionDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { transactions, categories, updateTransaction, deleteTransaction } =
    useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const transaction = transactions.find((t) => t.id === id);

  if (!transaction) {
    return (
      <Card>
        <EmptyState
          title="Transaksi tidak ditemukan"
          description="Mungkin sudah dihapus, atau tautannya sudah tidak berlaku."
          action={
            <Link href="/transactions">
              <Button size="sm">Kembali ke daftar</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const isIncome = transaction.direction === "in";
  // Kategori disaring per arah: transaksi keluar tidak boleh dapat kategori
  // pemasukan, dan kategori nonaktif tidak ditawarkan lagi untuk pilihan baru.
  const selectableCategories = categories.filter(
    (c) => c.kind === (isIncome ? "income" : "expense") && c.isActive,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
        >
          <IconChevronLeft className="size-3.5" />
          Kembali
        </Link>
        <Button
          size="sm"
          variant="ghost"
          className="text-rose-600 dark:text-rose-400"
          onClick={() => setConfirmOpen(true)}
        >
          <IconTrash className="size-3.5" />
          Hapus
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-medium",
                  SOURCE_STYLE[transaction.source],
                )}
              >
                {SOURCE_LABEL[transaction.source]}
              </span>
              <Badge tone={isIncome ? "success" : "danger"}>
                {isIncome ? "Masuk" : "Keluar"}
              </Badge>
              {transaction.isInternalTransfer ? (
                <Badge tone="info">Transfer internal</Badge>
              ) : null}
              {transaction.needsReview ? (
                <Badge tone="warning">Perlu review</Badge>
              ) : null}
              {transaction.extractionConfidence === "low" ? (
                <Badge tone="neutral">Confidence rendah</Badge>
              ) : null}
            </div>
            <p className="mt-3 truncate text-lg font-semibold tracking-tight">
              {transaction.counterpartyName ?? "Tanpa keterangan"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDateTime(transaction.occurredAt)} ·{" "}
              {ORIGIN_LABEL[transaction.origin]}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "tabular text-2xl font-semibold tracking-tight",
                transaction.isInternalTransfer
                  ? "text-muted"
                  : isIncome
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
              )}
            >
              {formatIDR(transaction.amount)}
            </p>
            {transaction.isInternalTransfer ? (
              <p className="mt-0.5 text-[11px] text-muted">
                tidak dihitung sebagai pengeluaran
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      {transaction.needsReview ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-500/10">
          <div>
            <p className="text-sm font-medium">Transaksi ini perlu dicek</p>
            <p className="mt-0.5 text-xs text-muted">
              {transaction.reviewReason
                ? REVIEW_REASON_LABEL[transaction.reviewReason]
                : "Ditandai untuk direview"}
              . Perbaiki bila ada yang salah, lalu tandai sudah benar.
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              updateTransaction(transaction.id, {
                needsReview: false,
                reviewReason: null,
              })
            }
          >
            Tandai sudah benar
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Klasifikasi"
            description="Perubahan langsung tersimpan"
          />
          <div className="space-y-4 px-5 py-4">
            <Field
              label="Kategori"
              hint={
                isIncome
                  ? "Hanya kategori pemasukan yang bisa dipilih."
                  : "Hanya kategori pengeluaran yang bisa dipilih."
              }
            >
              <Select
                value={transaction.categoryId ?? ""}
                onChange={(e) =>
                  updateTransaction(transaction.id, {
                    categoryId: e.target.value || null,
                    // Begitu kategori diisi, alasan review "belum berkategori"
                    // otomatis tidak berlaku lagi.
                    ...(e.target.value && transaction.reviewReason === "uncategorized"
                      ? { needsReview: false, reviewReason: null }
                      : {}),
                  })
                }
              >
                <option value="">— Belum berkategori —</option>
                {selectableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-3 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Transfer antar rekening sendiri</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {transaction.internalTransferMatchType === "account_number"
                    ? "Terdeteksi dari nomor rekening yang ada di daftar rekening sendiri."
                    : transaction.internalTransferMatchType === "fuzzy_name"
                      ? "Terdeteksi dari kemiripan nama — perlu dipastikan manual."
                      : "Aktifkan bila ini sebenarnya pindah dana antar rekening milik sendiri."}
                </p>
              </div>
              <Toggle
                label="Tandai sebagai transfer internal"
                checked={transaction.isInternalTransfer}
                onChange={(next) =>
                  updateTransaction(transaction.id, {
                    isInternalTransfer: next,
                    internalTransferMatchType: next
                      ? (transaction.internalTransferMatchType ?? "account_number")
                      : null,
                    ...(transaction.reviewReason === "fuzzy_internal_match"
                      ? { needsReview: false, reviewReason: null }
                      : {}),
                  })
                }
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Koreksi data"
            description="Untuk memperbaiki hasil ekstraksi yang meleset"
          />
          <div className="space-y-4 px-5 py-4">
            <Field label="Nominal">
              <AmountInput
                value={formatNumber(transaction.amount)}
                onChange={(e) =>
                  updateTransaction(transaction.id, {
                    amount: parseAmountInput(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Nama lawan transaksi">
              <Input
                value={transaction.counterpartyName ?? ""}
                onChange={(e) =>
                  updateTransaction(transaction.id, {
                    counterpartyName: e.target.value || null,
                  })
                }
              />
            </Field>
            <Field label="Tanggal transaksi">
              <Input
                type="date"
                value={toDateInputValue(transaction.occurredAt)}
                onChange={(e) =>
                  updateTransaction(transaction.id, {
                    occurredAt: fromDateInputValue(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Data mentah"
          description="Disimpan untuk audit — berguna saat hasil ekstraksi dicurigai salah"
        />
        <dl className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
          <Detail label="Jenis transaksi (label bank)">
            {transaction.rawTransactionType ?? "—"}
          </Detail>
          <Detail label="Nomor rekening lawan">
            {transaction.counterpartyAccountNumber ?? "— (disamarkan bank)"}
          </Detail>
          <Detail label="Gmail message ID">
            <code className="text-[11px]">
              {transaction.gmailMessageId ?? "—"}
            </code>
          </Detail>
          <Detail label="Confidence ekstraksi">
            {transaction.extractionConfidence === "high" ? "Tinggi" : "Rendah"}
          </Detail>
          {transaction.rawEmailSnippet ? (
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted">Cuplikan email</dt>
              <dd className="mt-1 rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] leading-relaxed break-words">
                {transaction.rawEmailSnippet}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          deleteTransaction(transaction.id);
          router.push("/transactions");
        }}
        title="Hapus transaksi?"
        message={
          <>
            <strong className="text-foreground">
              {transaction.counterpartyName ?? "Transaksi ini"}
            </strong>{" "}
            sebesar {formatIDR(transaction.amount)} akan dihapus permanen. Kalau
            transaksi ini tarik tunai, baris dompet tunainya ikut terhapus.
          </>
        }
      />
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-xs break-words">{children}</dd>
    </div>
  );
}
