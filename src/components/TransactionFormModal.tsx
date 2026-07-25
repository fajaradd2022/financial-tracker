"use client";

import { useState } from "react";
import {
  formatNumber,
  fromDateInputValue,
  parseAmountInput,
  SOURCE_LABEL,
  toDateInputValue,
} from "@/lib/format";
import type {
  Category,
  Transaction,
  TransactionDirection,
  TransactionSource,
} from "@/lib/types";
import { Modal } from "./Modal";
import { AmountInput, Button, cn, Field, Input, Select, Toggle } from "./ui";

const SOURCE_OPTIONS: TransactionSource[] = [
  "bca",
  "blu_bca",
  "seabank",
  "shopeepay",
  "ovo",
  "dana",
  "gopay",
  "manual_cash",
  "manual_other",
];

export interface TransactionFormValues {
  direction: TransactionDirection;
  amount: number;
  source: TransactionSource;
  categoryId: string | null;
  counterpartyName: string | null;
  rawTransactionType: string | null;
  occurredAt: string;
  isInternalTransfer: boolean;
}

/**
 * Form tambah/ubah transaksi.
 *
 * Di-mount ulang lewat `key` saat dibuka, sehingga nilai awal cukup lewat
 * useState initializer — tidak perlu efek yang bisa menimpa ketikan user.
 */
export function TransactionFormModal({
  open,
  transaction,
  categories,
  onClose,
  onSubmit,
}: {
  open: boolean;
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onSubmit: (values: TransactionFormValues) => void;
}) {
  if (!open) return null;
  return (
    <TransactionFormInner
      key={transaction?.id ?? "new"}
      transaction={transaction}
      categories={categories}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function TransactionFormInner({
  transaction,
  categories,
  onClose,
  onSubmit,
}: {
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onSubmit: (values: TransactionFormValues) => void;
}) {
  const [direction, setDirection] = useState<TransactionDirection>(
    transaction?.direction ?? "out",
  );
  const [amount, setAmount] = useState(() =>
    transaction ? formatNumber(transaction.amount) : "",
  );
  const [source, setSource] = useState<TransactionSource>(
    transaction?.source ?? "manual_other",
  );
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [counterparty, setCounterparty] = useState(
    transaction?.counterpartyName ?? "",
  );
  const [note, setNote] = useState(transaction?.rawTransactionType ?? "");
  const [date, setDate] = useState(() =>
    toDateInputValue(transaction?.occurredAt ?? new Date().toISOString()),
  );
  const [isInternal, setIsInternal] = useState(
    transaction?.isInternalTransfer ?? false,
  );
  const [touched, setTouched] = useState(false);

  const amountValue = parseAmountInput(amount);
  const valid = amountValue > 0;

  // Kategori mengikuti jenis transaksi: pemasukan tidak boleh dapat kategori
  // pengeluaran, dan sebaliknya. Kategori nonaktif tidak ditawarkan.
  const kind = direction === "in" ? "income" : "expense";
  const selectableCategories = categories.filter(
    (c) => c.kind === kind && c.isActive,
  );

  function changeDirection(next: TransactionDirection) {
    setDirection(next);
    // Kategori lama hampir pasti tidak valid untuk arah yang baru, jadi
    // dikosongkan daripada menyimpan pasangan yang tidak masuk akal.
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
      size="lg"
      title={transaction ? "Ubah transaksi" : "Tambah transaksi"}
      description="Untuk transaksi yang tidak tertangkap otomatis dari email."
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
                source,
                categoryId: categoryId || null,
                counterpartyName: counterparty.trim() || null,
                rawTransactionType: note.trim() || null,
                occurredAt: fromDateInputValue(date),
                isInternalTransfer: isInternal,
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jenis transaksi">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1">
              <DirectionTab
                active={direction === "in"}
                tone="in"
                onClick={() => changeDirection("in")}
              >
                Pemasukan
              </DirectionTab>
              <DirectionTab
                active={direction === "out"}
                tone="out"
                onClick={() => changeDirection("out")}
              >
                Pengeluaran
              </DirectionTab>
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sumber / rekening">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as TransactionSource)}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
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
              <option value="">— Belum berkategori —</option>
              {selectableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={direction === "in" ? "Dari (pengirim)" : "Ke (penerima)"}
          >
            <Input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder={direction === "in" ? "Nama pengirim" : "Nama penerima / merchant"}
            />
          </Field>
          <Field label="Tanggal">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Keterangan" hint="Contoh: QRIS, transfer, tarik tunai">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Jenis transaksi"
          />
        </Field>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-3 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">Transfer antar rekening sendiri</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Aktifkan bila ini hanya pindah dana antar rekening milik Anda atau
              istri — tidak akan dihitung sebagai pemasukan/pengeluaran.
            </p>
          </div>
          <Toggle
            label="Tandai sebagai transfer internal"
            checked={isInternal}
            onChange={setIsInternal}
          />
        </div>
      </div>
    </Modal>
  );
}

function DirectionTab({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "in" | "out";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? tone === "in"
            ? "bg-surface text-emerald-700 shadow-sm dark:text-emerald-400"
            : "bg-surface text-rose-700 shadow-sm dark:text-rose-400"
          : "text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
