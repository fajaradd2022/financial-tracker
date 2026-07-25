"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { IconDownload, IconPlus, IconSearch } from "@/components/icons";
import { PaginationBar, usePaginated } from "@/components/Pagination";
import { PeriodPicker } from "@/components/PeriodPicker";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionRow } from "@/components/TransactionRow";
import {
  Button,
  Card,
  cn,
  EmptyState,
  Input,
  Money,
  Select,
} from "@/components/ui";
import { exportTransactionsToExcel } from "@/lib/export-excel";
import { formatIDR, SOURCE_LABEL } from "@/lib/format";
import { currentMonthPeriod, isInPeriod } from "@/lib/period";
import { availableYears, useStore } from "@/lib/store";
import type { TransactionSource } from "@/lib/types";

type DirectionFilter = "all" | "in" | "out";

export function TransactionsClient() {
  const searchParams = useSearchParams();
  const { transactions, categories, categoryById, addTransaction } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [query, setQuery] = useState("");
  // Periode awal = bulan berjalan. Disimpan terpisah supaya "Reset filter" dan
  // penanda "ada filter aktif" mengacu ke nilai yang sama, bukan ke tebakan.
  const initialPeriod = useMemo(() => currentMonthPeriod(), []);
  const [period, setPeriod] = useState(initialPeriod);
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [source, setSource] = useState<TransactionSource | "all">("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  // Dashboard menautkan ke ?review=1, jadi filter ini menyala dari URL.
  const [onlyReview, setOnlyReview] = useState(
    () => searchParams.get("review") === "1",
  );
  const [hideInternal, setHideInternal] = useState(false);

  const years = useMemo(
    () => availableYears(transactions.map((t) => t.occurredAt)),
    [transactions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => {
        if (onlyReview && !t.needsReview) return false;
        if (hideInternal && t.isInternalTransfer) return false;
        if (!isInPeriod(t.occurredAt, period)) return false;
        if (direction !== "all" && t.direction !== direction) return false;
        if (source !== "all" && t.source !== source) return false;
        if (categoryId !== "all") {
          if (
            categoryId === "none"
              ? t.categoryId !== null
              : t.categoryId !== categoryId
          )
            return false;
        }
        if (q) {
          const haystack = [
            t.counterpartyName,
            t.counterpartyAccountNumber,
            t.rawTransactionType,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [
    transactions,
    query,
    period,
    direction,
    source,
    categoryId,
    onlyReview,
    hideInternal,
  ]);

  const paged = usePaginated(filtered, 10);

  // Total di bawah filter mengikuti aturan produk: internal tidak dihitung.
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let internal = 0;
    for (const t of filtered) {
      if (t.isInternalTransfer) internal += t.amount;
      else if (t.direction === "in") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, internal };
  }, [filtered]);

  const reviewCount = transactions.filter((t) => t.needsReview).length;
  const periodChanged =
    period.startDay !== initialPeriod.startDay ||
    period.endDay !== initialPeriod.endDay;
  const hasActiveFilter =
    query !== "" ||
    periodChanged ||
    direction !== "all" ||
    source !== "all" ||
    categoryId !== "all" ||
    onlyReview ||
    hideInternal;

  function resetFilters() {
    setQuery("");
    setPeriod(initialPeriod);
    setDirection("all");
    setSource("all");
    setCategoryId("all");
    setOnlyReview(false);
    setHideInternal(false);
  }

  async function exportExcel() {
    setExporting(true);
    try {
      // Yang diekspor adalah hasil filter (seluruhnya, bukan halaman aktif) —
      // supaya isi file cocok dengan yang sedang dilihat user.
      await exportTransactionsToExcel(filtered, categories, period.label);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Transaksi</h1>
          <p className="text-xs text-muted">
            {transactions.length} transaksi tercatat
            {reviewCount > 0 ? ` · ${reviewCount} perlu direview` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker
            value={period}
            onChange={setPeriod}
            availableYears={years}
          />
          <Button
            size="sm"
            onClick={exportExcel}
            disabled={exporting || filtered.length === 0}
          >
            <IconDownload className="size-3.5" />
            {exporting ? "Menyiapkan…" : "Export Excel"}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
            <IconPlus className="size-3.5" />
            Tambah transaksi
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="relative mb-3">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama penerima, nomor rekening, jenis transaksi…"
            className="pl-9"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as DirectionFilter)}
            aria-label="Arah transaksi"
          >
            <option value="all">Masuk & keluar</option>
            <option value="in">Hanya pemasukan</option>
            <option value="out">Hanya pengeluaran</option>
          </Select>

          <Select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as TransactionSource | "all")
            }
            aria-label="Sumber"
          >
            <option value="all">Semua sumber</option>
            {(Object.keys(SOURCE_LABEL) as TransactionSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>

          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Kategori"
          >
            <option value="all">Semua kategori</option>
            <option value="none">Belum berkategori</option>
            <optgroup label="Pemasukan">
              {categories
                .filter((c) => c.kind === "income")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Pengeluaran">
              {categories
                .filter((c) => c.kind === "expense")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterChip
            active={onlyReview}
            onClick={() => setOnlyReview((v) => !v)}
          >
            Perlu review{reviewCount > 0 ? ` (${reviewCount})` : ""}
          </FilterChip>
          <FilterChip
            active={hideInternal}
            onClick={() => setHideInternal((v) => !v)}
          >
            Sembunyikan transfer internal
          </FilterChip>
          {hasActiveFilter ? (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              Reset filter
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Pemasukan" value={totals.income} tone="income" />
        <SummaryTile label="Pengeluaran" value={totals.expense} tone="expense" />
        <SummaryTile
          label="Transfer internal"
          value={totals.internal}
          tone="neutral"
          hint="tidak dihitung"
        />
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="Tidak ada transaksi yang cocok"
            description="Coba longgarkan filter atau ubah kata kunci pencarian."
            action={
              hasActiveFilter ? (
                <Button size="sm" onClick={resetFilters}>
                  Reset filter
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="divide-y divide-line">
              {paged.rows.map((t) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  category={categoryById(t.categoryId)}
                />
              ))}
            </div>
            <PaginationBar
              page={paged.page}
              pageCount={paged.pageCount}
              pageSize={paged.pageSize}
              total={paged.total}
              rangeFrom={paged.rangeFrom}
              rangeTo={paged.rangeTo}
              onPageChange={paged.setPage}
              onPageSizeChange={paged.setPageSize}
              itemLabel="transaksi"
            />
          </>
        )}
      </Card>

      <TransactionFormModal
        open={formOpen}
        transaction={null}
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) =>
          addTransaction({
            ...values,
            counterpartyAccountNumber: null,
            origin: "manual_web",
            gmailMessageId: null,
            rawEmailSnippet: null,
            extractionConfidence: "high",
            internalTransferMatchType: values.isInternalTransfer
              ? "account_number"
              : null,
            needsReview: false,
            reviewReason: null,
          })
        }
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
          : "border-line text-muted hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "income" | "expense" | "neutral";
  hint?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] text-muted">
        {label}
        {hint ? <span className="ml-1">· {hint}</span> : null}
      </p>
      <p
        className={cn(
          "tabular mt-1 text-base font-semibold",
          tone === "income" && "text-emerald-600 dark:text-emerald-400",
          tone === "expense" && "text-rose-600 dark:text-rose-400",
          tone === "neutral" && "text-muted",
        )}
      >
        <Money value={formatIDR(value)} />
      </p>
    </Card>
  );
}
