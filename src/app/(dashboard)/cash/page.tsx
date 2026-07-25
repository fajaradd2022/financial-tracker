"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/Modal";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconDownload,
  IconPencil,
  IconPlus,
  IconTrash,
  IconWhatsApp,
} from "@/components/icons";
import { PaginationBar, usePaginated } from "@/components/Pagination";
import { PeriodPicker } from "@/components/PeriodPicker";
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
  Money,
  Select,
  Textarea,
} from "@/components/ui";
import { exportCashEntriesToExcel } from "@/lib/export-excel";
import {
  CASH_ENTRY_LABEL,
  formatDate,
  formatIDR,
  formatNumber,
  fromDateInputValue,
  parseAmountInput,
  toDateInputValue,
} from "@/lib/format";
import { currentMonthPeriod, isInPeriod } from "@/lib/period";
import { availableYears, useStore } from "@/lib/store";
import type { CashWalletEntry } from "@/lib/types";

export default function CashPage() {
  const {
    cashEntries,
    categories,
    cashBalance,
    categoryById,
    addCashEntry,
    updateCashEntry,
    deleteCashEntry,
  } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CashWalletEntry | null>(null);
  const [deleting, setDeleting] = useState<CashWalletEntry | null>(null);
  // Periode awal = bulan berjalan, sama seperti di halaman Transaksi.
  const [period, setPeriod] = useState(currentMonthPeriod);
  const [exporting, setExporting] = useState(false);

  const years = useMemo(
    () => availableYears(cashEntries.map((e) => e.occurredAt)),
    [cashEntries],
  );

  const visible = useMemo(
    () =>
      cashEntries
        .filter((e) => isInPeriod(e.occurredAt, period))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [cashEntries, period],
  );

  const paged = usePaginated(visible, 10);

  const totals = useMemo(() => {
    const inflow = visible
      .filter((e) => e.entryType !== "manual_expense_debit")
      .reduce((s, e) => s + e.amount, 0);
    const spent = visible
      .filter((e) => e.entryType === "manual_expense_debit")
      .reduce((s, e) => s + e.amount, 0);
    return { inflow, spent, unexplained: inflow - spent };
  }, [visible]);

  async function exportExcel() {
    setExporting(true);
    try {
      await exportCashEntriesToExcel(visible, categories, period.label);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dompet Tunai</h1>
          <p className="text-xs text-muted">
            Tarik tunai menambah saldo, pengeluaran tunai menguranginya
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
            disabled={exporting || visible.length === 0}
          >
            <IconDownload className="size-3.5" />
            {exporting ? "Menyiapkan…" : "Export Excel"}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <IconPlus className="size-3.5" />
            Tambah transaksi
          </Button>
        </div>
      </div>

      {/* Saldo dihitung dari SUM seluruh baris, bukan angka yang disimpan —
          jadi setiap koreksi/hapus otomatis benar tanpa perlu diperbaiki. */}
      <Card
        className={cn(
          "overflow-hidden p-5",
          cashBalance < 0 &&
            "border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10",
        )}
      >
        <p className="text-xs text-muted">Saldo tunai saat ini</p>
        <p
          className={cn(
            "tabular mt-1 text-3xl font-semibold tracking-tight",
            cashBalance < 0 && "text-rose-600 dark:text-rose-400",
          )}
        >
          <Money value={formatIDR(cashBalance)} />
        </p>
        <p className="mt-2 max-w-xl text-xs text-muted">
          {cashBalance < 0
            ? "Saldo minus berarti pengeluaran tunai yang dicatat melebihi total tarik tunai. Cek apakah ada penarikan yang belum masuk, atau nominal yang salah ketik."
            : "Ini perkiraan uang tunai yang masih di dompet: total uang tunai masuk dikurangi pengeluaran tunai yang sudah Anda catat."}
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Tunai masuk" value={totals.inflow} tone="in" />
        <Tile label="Sudah dicatat" value={totals.spent} tone="out" />
        <Tile
          label="Belum dijelaskan"
          value={totals.unexplained}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader
          title="Riwayat dompet tunai"
          description={`${period.label} · baris tarik tunai dibuat otomatis dari email bank`}
        />

        {visible.length === 0 ? (
          <EmptyState
            title="Belum ada catatan tunai"
            description="Catat transaksi tunai pertama Anda, atau tunggu email tarik tunai masuk."
          />
        ) : (
          <>
            <div className="divide-y divide-line">
              {paged.rows.map((entry) => {
                const isDebit = entry.entryType === "manual_expense_debit";
                const category = categoryById(entry.categoryId);
                const editable = entry.entryType !== "withdrawal_credit";
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        isDebit
                          ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
                          : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
                      )}
                    >
                      {isDebit ? <IconArrowUpRight /> : <IconArrowDownLeft />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.note ?? CASH_ENTRY_LABEL[entry.entryType]}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        <span>{formatDate(entry.occurredAt)}</span>
                        {category ? <span>· {category.name}</span> : null}
                        {entry.origin === "manual_wa" ? (
                          <Badge tone="success" className="gap-1">
                            <IconWhatsApp className="size-3" />
                            WhatsApp
                          </Badge>
                        ) : entry.origin === "email" ? (
                          <Badge tone="info">Otomatis dari email</Badge>
                        ) : null}
                      </div>
                    </div>

                    <p
                      className={cn(
                        "tabular shrink-0 text-sm font-semibold",
                        isDebit
                          ? "text-foreground"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {isDebit ? "−" : "+"}
                      {formatIDR(entry.amount)}
                    </p>

                    {editable ? (
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          aria-label="Ubah"
                          onClick={() => {
                            setEditing(entry);
                            setFormOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                        >
                          <IconPencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Hapus"
                          onClick={() => setDeleting(entry)}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-rose-600"
                        >
                          <IconTrash className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      // Baris tarik tunai berasal dari transaksi bank; diubah
                      // dari sana, bukan di sini, supaya keduanya tidak lepas.
                      <span className="w-13 shrink-0" />
                    )}
                  </div>
                );
              })}
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
              itemLabel="catatan"
            />
          </>
        )}
      </Card>

      <CashEntryForm
        open={formOpen}
        entry={editing}
        categories={categories}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(values) => {
          const { direction, ...rest } = values;
          const entryType =
            direction === "in" ? "adjustment" : "manual_expense_debit";
          if (editing) updateCashEntry(editing.id, { ...rest, entryType });
          else
            addCashEntry({
              ...rest,
              entryType,
              transactionId: null,
              origin: "manual_web",
            });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteCashEntry(deleting.id)}
        title="Hapus catatan tunai?"
        message={
          deleting ? (
            <>
              <strong className="text-foreground">
                {deleting.note ?? "Catatan ini"}
              </strong>{" "}
              sebesar {formatIDR(deleting.amount)} akan dihapus. Saldo dompet
              tunai otomatis menyesuaikan.
            </>
          ) : null
        }
      />
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "in" | "out" | "neutral";
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-base font-semibold",
          tone === "in" && "text-emerald-600 dark:text-emerald-400",
          tone === "out" && "text-rose-600 dark:text-rose-400",
        )}
      >
        <Money value={formatIDR(value)} />
      </p>
    </Card>
  );
}

interface CashFormValues {
  direction: "in" | "out";
  amount: number;
  categoryId: string | null;
  note: string | null;
  occurredAt: string;
}

function CashEntryForm({
  open,
  entry,
  categories,
  onClose,
  onSubmit,
}: {
  open: boolean;
  entry: CashWalletEntry | null;
  categories: { id: string; name: string; kind: string; isActive: boolean }[];
  onClose: () => void;
  onSubmit: (values: CashFormValues) => void;
}) {
  if (!open) return null;
  return (
    <CashEntryFormInner
      key={entry?.id ?? "new"}
      entry={entry}
      categories={categories}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function CashEntryFormInner({
  entry,
  categories,
  onClose,
  onSubmit,
}: {
  entry: CashWalletEntry | null;
  categories: { id: string; name: string; kind: string; isActive: boolean }[];
  onClose: () => void;
  onSubmit: (values: CashFormValues) => void;
}) {
  const [direction, setDirection] = useState<"in" | "out">(
    entry && entry.entryType !== "manual_expense_debit" ? "in" : "out",
  );
  const [amount, setAmount] = useState(() =>
    entry ? formatNumber(entry.amount) : "",
  );
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(() =>
    toDateInputValue(entry?.occurredAt ?? new Date().toISOString()),
  );
  const [touched, setTouched] = useState(false);

  const amountValue = parseAmountInput(amount);
  const valid = amountValue > 0;

  const kind = direction === "in" ? "income" : "expense";
  const selectableCategories = categories.filter(
    (c) => c.kind === kind && c.isActive,
  );

  function changeDirection(next: "in" | "out") {
    setDirection(next);
    const stillValid = categories.some(
      (c) =>
        c.id === categoryId &&
        c.kind === (next === "in" ? "income" : "expense"),
    );
    if (!stillValid) setCategoryId("");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? "Ubah transaksi tunai" : "Tambah transaksi tunai"}
      description="Uang tunai fisik — menambah atau mengurangi saldo dompet."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true);
              if (!valid) return;
              onSubmit({
                direction,
                amount: amountValue,
                categoryId: categoryId || null,
                note: note.trim() || null,
                occurredAt: fromDateInputValue(date),
              });
              onClose();
            }}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Jenis transaksi">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1">
            <button
              type="button"
              onClick={() => changeDirection("in")}
              aria-pressed={direction === "in"}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                direction === "in"
                  ? "bg-surface text-emerald-700 shadow-sm dark:text-emerald-400"
                  : "text-muted hover:text-foreground",
              )}
            >
              Pemasukan tunai
            </button>
            <button
              type="button"
              onClick={() => changeDirection("out")}
              aria-pressed={direction === "out"}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                direction === "out"
                  ? "bg-surface text-rose-700 shadow-sm dark:text-rose-400"
                  : "text-muted hover:text-foreground",
              )}
            >
              Pengeluaran tunai
            </button>
          </div>
        </Field>

        <Field
          label="Nominal"
          hint={touched && !valid ? "Nominal harus lebih dari nol." : undefined}
        >
          <AmountInput
            autoFocus
            value={amount}
            onChange={(e) => {
              const parsed = parseAmountInput(e.target.value);
              setAmount(parsed ? formatNumber(parsed) : "");
            }}
            placeholder="0"
          />
        </Field>

        <Field
          label={
            direction === "in" ? "Kategori pemasukan" : "Kategori pengeluaran"
          }
        >
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— Pilih kategori —</option>
            {selectableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tanggal">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field
          label="Catatan"
          hint={
            direction === "in"
              ? "Contoh: uang tunai dari orang tua, kembalian"
              : "Contoh: makan siang warteg, parkir, bensin"
          }
        >
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={direction === "in" ? "Dari mana?" : "Dipakai untuk apa?"}
          />
        </Field>
      </div>
    </Modal>
  );
}
