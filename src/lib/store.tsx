"use client";

import { createContext, useContext, useMemo, useTransition } from "react";
import {
  createCashEntryAction,
  createCategoryAction,
  createOwnAccountAction,
  createTransactionAction,
  createWhatsAppNumberAction,
  deleteCashEntryAction,
  deleteCategoryAction,
  deleteOwnAccountAction,
  deleteTransactionAction,
  deleteWhatsAppNumberAction,
  updateCashEntryAction,
  updateCategoryAction,
  updateIngestionConfigAction,
  updateOwnAccountAction,
  updateTransactionAction,
  updateWhatsAppNumberAction,
} from "@/app/actions";
import { dayKey } from "./format";
import { isInPeriod, type Period } from "./period";
import type { NewTransactionInput } from "@/db/repositories";
import type {
  CashWalletEntry,
  Category,
  Collaboration,
  CollaborationEntry,
  CollaborationSummary,
  IngestionConfig,
  OwnAccount,
  SourceHealth,
  Transaction,
  WhatsAppNumber,
} from "./types";

/**
 * Penyedia data aplikasi untuk komponen client.
 *
 * Datanya diambil di server (lihat `(dashboard)/layout.tsx`) lalu diturunkan
 * lewat context; mutasinya memanggil server action. Setiap action memanggil
 * `revalidatePath`, jadi halaman otomatis dirender ulang dengan data terbaru —
 * tidak ada salinan state di client yang bisa menyimpang dari isi database.
 *
 * Bentuk `useStore()` sengaja dipertahankan sama seperti saat masih memakai
 * data dummy, supaya perpindahan ke database tidak merembet ke seluruh halaman.
 */

export interface AppData {
  transactions: Transaction[];
  categories: Category[];
  ownAccounts: OwnAccount[];
  cashEntries: CashWalletEntry[];
  waNumbers: WhatsAppNumber[];
  sourceHealth: SourceHealth[];
  ingestion: IngestionConfig;
  collaborations: Collaboration[];
  collaborationEntries: CollaborationEntry[];
  collaborationSummaries: CollaborationSummary[];
  /** Id user yang sedang login — dipakai membedakan arah entri kolaborasi. */
  currentUserId: string;
  /**
   * Nama pemilik rekening untuk pencocokan nama cadangan. Diturunkan dari env
   * di sisi server — data pribadi yang tidak layak ditanam di kode maupun
   * disimpan di database bersama data transaksi.
   */
  ownerNames: string[];
}

interface StoreValue extends AppData {
  /** true selama mutasi berjalan — dipakai menonaktifkan tombol. */
  isMutating: boolean;
  categoryById: (id: string | null) => Category | undefined;
  cashBalance: number;

  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addTransaction: (tx: NewTransactionInput) => void;

  addCategory: (input: Omit<Category, "id">) => void;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  addOwnAccount: (input: Omit<OwnAccount, "id">) => void;
  updateOwnAccount: (id: string, patch: Partial<OwnAccount>) => void;
  deleteOwnAccount: (id: string) => void;

  addCashEntry: (input: Omit<CashWalletEntry, "id">) => void;
  updateCashEntry: (id: string, patch: Partial<CashWalletEntry>) => void;
  deleteCashEntry: (id: string) => void;

  addWaNumber: (input: Omit<WhatsAppNumber, "id">) => void;
  updateWaNumber: (id: string, patch: Partial<WhatsAppNumber>) => void;
  deleteWaNumber: (id: string) => void;

  updateIngestion: (patch: Partial<IngestionConfig>) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  data,
  children,
}: {
  data: AppData;
  children: React.ReactNode;
}) {
  const [isMutating, startTransition] = useTransition();

  const value = useMemo<StoreValue>(() => {
    // Dibungkus transition supaya React tahu render ulang setelah action
    // adalah pembaruan non-mendesak — UI tetap responsif selagi menunggu.
    const run = (action: () => Promise<unknown>) => {
      startTransition(async () => {
        await action();
      });
    };

    const cashBalance = data.cashEntries.reduce(
      (sum, entry) =>
        entry.entryType === "manual_expense_debit"
          ? sum - entry.amount
          : sum + entry.amount,
      0,
    );

    return {
      ...data,
      isMutating,
      cashBalance,
      categoryById: (id) =>
        id ? data.categories.find((c) => c.id === id) : undefined,

      updateTransaction: (id, patch) =>
        run(() => updateTransactionAction(id, patch)),
      deleteTransaction: (id) => run(() => deleteTransactionAction(id)),
      addTransaction: (tx) => run(() => createTransactionAction(tx)),

      addCategory: (input) => run(() => createCategoryAction(input)),
      updateCategory: (id, patch) => run(() => updateCategoryAction(id, patch)),
      deleteCategory: (id) => run(() => deleteCategoryAction(id)),

      addOwnAccount: (input) => run(() => createOwnAccountAction(input)),
      updateOwnAccount: (id, patch) =>
        run(() => updateOwnAccountAction(id, patch)),
      deleteOwnAccount: (id) => run(() => deleteOwnAccountAction(id)),

      addCashEntry: (input) => run(() => createCashEntryAction(input)),
      updateCashEntry: (id, patch) => run(() => updateCashEntryAction(id, patch)),
      deleteCashEntry: (id) => run(() => deleteCashEntryAction(id)),

      addWaNumber: (input) => run(() => createWhatsAppNumberAction(input)),
      updateWaNumber: (id, patch) =>
        run(() => updateWhatsAppNumberAction(id, patch)),
      deleteWaNumber: (id) => run(() => deleteWhatsAppNumberAction(id)),

      updateIngestion: (patch) => run(() => updateIngestionConfigAction(patch)),
    };
  }, [data, isMutating]);

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore harus dipakai di dalam <StoreProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Selector turunan
// ---------------------------------------------------------------------------

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  internalTransferTotal: number;
  internalTransferCount: number;
  cashWithdrawn: number;
  transactionCount: number;
}

/**
 * Ringkasan satu periode.
 *
 * Aturan inti produk ada di sini: transfer antar rekening sendiri
 * (`isInternalTransfer`) tidak pernah ikut dihitung sebagai pemasukan maupun
 * pengeluaran — hanya dilaporkan terpisah sebagai informasi.
 */
export function summarizePeriod(
  transactions: Transaction[],
  period: Period,
): PeriodSummary {
  const rows = transactions.filter((t) => isInPeriod(t.occurredAt, period));

  let income = 0;
  let expense = 0;
  let internalTransferTotal = 0;
  let internalTransferCount = 0;
  let cashWithdrawn = 0;

  for (const t of rows) {
    if (t.isInternalTransfer) {
      internalTransferTotal += t.amount;
      internalTransferCount += 1;
      continue;
    }
    if (t.direction === "in") income += t.amount;
    else expense += t.amount;

    if (isCashWithdrawal(t)) cashWithdrawn += t.amount;
  }

  return {
    income,
    expense,
    net: income - expense,
    internalTransferTotal,
    internalTransferCount,
    cashWithdrawn,
    transactionCount: rows.length,
  };
}

/** Tarik tunai dikenali dari label mentah bank — aturan yang sama dipakai backend. */
export function isCashWithdrawal(t: Transaction): boolean {
  const raw = (t.rawTransactionType ?? "").toLowerCase();
  return raw.includes("tarik tunai") || raw.includes("atm");
}

export interface CategoryBreakdownRow {
  categoryId: string | null;
  name: string;
  total: number;
  share: number;
  count: number;
}

/**
 * Total per kategori untuk satu arah (masuk/keluar) dalam satu periode.
 * Transfer internal selalu dikeluarkan — sama seperti di ringkasan.
 */
export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  period: Period,
  direction: "in" | "out",
): CategoryBreakdownRow[] {
  const rows = transactions.filter(
    (t) =>
      isInPeriod(t.occurredAt, period) &&
      t.direction === direction &&
      !t.isInternalTransfer,
  );

  const totals = new Map<string | null, { total: number; count: number }>();
  for (const t of rows) {
    const current = totals.get(t.categoryId) ?? { total: 0, count: 0 };
    totals.set(t.categoryId, {
      total: current.total + t.amount,
      count: current.count + 1,
    });
  }

  const grandTotal = rows.reduce((sum, t) => sum + t.amount, 0);

  return [...totals.entries()]
    .map(([categoryId, { total, count }]) => ({
      categoryId,
      name:
        categories.find((c) => c.id === categoryId)?.name ?? "Belum berkategori",
      total,
      count,
      share: grandTotal > 0 ? total / grandTotal : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Tahun yang punya data, terbaru dulu — jadi pilihan cepat di PeriodPicker. */
export function availableYears(isoDates: string[]): number[] {
  return [...new Set(isoDates.map((iso) => Number(dayKey(iso).slice(0, 4))))]
    .sort((a, b) => b - a);
}
