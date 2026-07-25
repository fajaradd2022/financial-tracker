"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  DUMMY_CASH_ENTRIES,
  DUMMY_CATEGORIES,
  DUMMY_INGESTION_CONFIG,
  DUMMY_OWN_ACCOUNTS,
  DUMMY_SOURCE_HEALTH,
  DUMMY_TRANSACTIONS,
  DUMMY_WA_NUMBERS,
} from "./dummy-data";
import { dayKey } from "./format";
import { isInPeriod, type Period } from "./period";
import type {
  CashWalletEntry,
  Category,
  IngestionConfig,
  OwnAccount,
  SourceHealth,
  Transaction,
  WhatsAppNumber,
} from "./types";

/**
 * Store demo pengganti backend.
 *
 * Dibuat sebagai *external store* (di luar React) lalu dibaca lewat
 * `useSyncExternalStore`, bukan useState + useEffect. Alasannya: data awal
 * datang dari localStorage yang hanya ada di browser. Dengan pola ini React
 * memakai `getServerSnapshot` saat render server & hydration, lalu otomatis
 * beralih ke snapshot browser — tanpa efek yang men-set state (yang memicu
 * cascading render) dan tanpa hydration mismatch.
 *
 * Bentuk API-nya sengaja mirip repository asli (`updateTransaction(id, patch)`),
 * supaya saat backend siap, komponen tinggal ganti pemanggilan ke server action.
 */

const STORAGE_KEY = "financial-tracker:demo-state:v1";

interface StoreState {
  transactions: Transaction[];
  categories: Category[];
  ownAccounts: OwnAccount[];
  cashEntries: CashWalletEntry[];
  waNumbers: WhatsAppNumber[];
  sourceHealth: SourceHealth[];
  ingestion: IngestionConfig;
}

function freshState(): StoreState {
  return {
    transactions: DUMMY_TRANSACTIONS,
    categories: DUMMY_CATEGORIES,
    ownAccounts: DUMMY_OWN_ACCOUNTS,
    cashEntries: DUMMY_CASH_ENTRIES,
    waNumbers: DUMMY_WA_NUMBERS,
    sourceHealth: DUMMY_SOURCE_HEALTH,
    ingestion: DUMMY_INGESTION_CONFIG,
  };
}

/** Referensi tetap — `getServerSnapshot` wajib mengembalikan objek yang sama. */
const SERVER_STATE: StoreState = freshState();

let state: StoreState = SERVER_STATE;
let loadedFromStorage = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage bisa gagal (mode privat/kuota penuh). Kegagalan menyimpan
    // tidak boleh merusak UI — data tetap hidup di memori.
  }
}

function loadFromStorage() {
  loadedFromStorage = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...freshState(), ...JSON.parse(raw) };
  } catch {
    // data rusak / tidak bisa dibaca -> pakai data dummy apa adanya
  }
}

function subscribe(listener: () => void) {
  // Pembacaan localStorage dilakukan saat langganan pertama (pasti di browser).
  // React membaca ulang snapshot setelah subscribe, jadi perubahan di sini
  // otomatis terdeteksi tanpa perlu emit manual.
  if (!loadedFromStorage) loadFromStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => SERVER_STATE;

function setState(updater: (prev: StoreState) => StoreState) {
  state = updater(state);
  persist();
  emit();
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Kunci-kunci StoreState yang isinya daftar berisi `id` — hanya itu yang boleh
 * lewat helper di bawah. `ingestion` bukan daftar, jadi otomatis tersaring.
 */
type ListKey = {
  [K in keyof StoreState]: StoreState[K] extends { id: string }[] ? K : never;
}[keyof StoreState];

/** Helper generik untuk patch/hapus baris pada salah satu koleksi. */
function patchIn<K extends ListKey>(
  key: K,
  id: string,
  patch: Partial<StoreState[K][number]>,
) {
  setState((prev) => ({
    ...prev,
    [key]: (prev[key] as { id: string }[]).map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }));
}

function removeIn(key: ListKey, id: string) {
  setState((prev) => ({
    ...prev,
    [key]: (prev[key] as { id: string }[]).filter((item) => item.id !== id),
  }));
}

/**
 * Provider dipertahankan sebagai pembungkus eksplisit di layout, walau store-nya
 * modul-global — supaya batas "area yang punya data" tetap terbaca di kode.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useStore() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const categoryById = useCallback(
    (id: string | null) =>
      id ? snapshot.categories.find((c) => c.id === id) : undefined,
    [snapshot.categories],
  );

  const cashBalance = useMemo(
    () =>
      snapshot.cashEntries.reduce(
        (sum, entry) =>
          entry.entryType === "manual_expense_debit"
            ? sum - entry.amount
            : sum + entry.amount,
        0,
      ),
    [snapshot.cashEntries],
  );

  return useMemo(
    () => ({
      ...snapshot,
      categoryById,
      cashBalance,

      // Transaksi
      updateTransaction: (id: string, patch: Partial<Transaction>) =>
        patchIn("transactions", id, patch),
      deleteTransaction: (id: string) =>
        setState((prev) => ({
          ...prev,
          transactions: prev.transactions.filter((t) => t.id !== id),
          // Baris dompet tunai yang lahir dari transaksi ini ikut dibuang,
          // supaya saldo tidak lagi menghitung tarik tunai yang sudah tiada.
          cashEntries: prev.cashEntries.filter((e) => e.transactionId !== id),
        })),
      addTransaction: (tx: Omit<Transaction, "id">) => {
        const id = nextId("tx");
        setState((prev) => ({
          ...prev,
          transactions: [{ ...tx, id }, ...prev.transactions],
        }));
        return id;
      },

      // Kategori
      addCategory: (input: Omit<Category, "id">) =>
        setState((prev) => ({
          ...prev,
          categories: [...prev.categories, { ...input, id: nextId("cat") }],
        })),
      updateCategory: (id: string, patch: Partial<Category>) =>
        patchIn("categories", id, patch),
      deleteCategory: (id: string) => removeIn("categories", id),

      // Rekening sendiri
      addOwnAccount: (input: Omit<OwnAccount, "id">) =>
        setState((prev) => ({
          ...prev,
          ownAccounts: [...prev.ownAccounts, { ...input, id: nextId("acc") }],
        })),
      updateOwnAccount: (id: string, patch: Partial<OwnAccount>) =>
        patchIn("ownAccounts", id, patch),
      deleteOwnAccount: (id: string) => removeIn("ownAccounts", id),

      // Dompet tunai
      addCashEntry: (input: Omit<CashWalletEntry, "id">) =>
        setState((prev) => ({
          ...prev,
          cashEntries: [{ ...input, id: nextId("cw") }, ...prev.cashEntries],
        })),
      updateCashEntry: (id: string, patch: Partial<CashWalletEntry>) =>
        patchIn("cashEntries", id, patch),
      deleteCashEntry: (id: string) => removeIn("cashEntries", id),

      // Nomor WhatsApp
      addWaNumber: (input: Omit<WhatsAppNumber, "id">) =>
        setState((prev) => ({
          ...prev,
          waNumbers: [...prev.waNumbers, { ...input, id: nextId("wa") }],
        })),
      updateWaNumber: (id: string, patch: Partial<WhatsAppNumber>) =>
        patchIn("waNumbers", id, patch),
      deleteWaNumber: (id: string) => removeIn("waNumbers", id),

      // Konfigurasi ingestion
      updateIngestion: (patch: Partial<IngestionConfig>) =>
        setState((prev) => ({
          ...prev,
          ingestion: { ...prev.ingestion, ...patch },
        })),

      resetDemoData: () => {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // abaikan
        }
        setState(() => freshState());
      },
    }),
    [snapshot, categoryById, cashBalance],
  );
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
