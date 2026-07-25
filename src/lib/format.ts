import type {
  AccountOwner,
  CashWalletEntryType,
  ReviewReason,
  TransactionOrigin,
  TransactionSource,
} from "./types";

/**
 * Semua formatter mengunci timeZone ke Asia/Jakarta. Ini bukan kosmetik:
 * tanpa timeZone eksplisit, server (UTC) dan browser (WIB) merender string
 * berbeda dan React melempar hydration mismatch.
 */
const JAKARTA = "Asia/Jakarta";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const idrCompact = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const plainNumber = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

/** "Rp1.500.000" */
export function formatIDR(amount: number): string {
  return idr.format(amount);
}

/** "Rp1,5 jt" — untuk kartu statistik yang sempit. */
export function formatIDRCompact(amount: number): string {
  return idrCompact.format(amount);
}

/** "1.500.000" — untuk input form yang sudah punya prefix "Rp". */
export function formatNumber(amount: number): string {
  return plainNumber.format(amount);
}

/** Membaca input user yang mungkin mengandung titik/koma/spasi: "1.500.000" -> 1500000 */
export function parseAmountInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

/** "26 Jul 2026" */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: JAKARTA,
  }).format(new Date(iso));
}

/** "26 Jul 2026, 14.05" */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: JAKARTA,
  }).format(new Date(iso));
}

/** "Juli 2026" */
export function formatMonthLabel(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: JAKARTA,
  }).format(new Date(iso));
}

/** "2026-07" -> "Juli 2026". Jam 12.00 UTC dipilih agar tidak pernah geser bulan. */
export function monthKeyToLabel(key: string): string {
  return formatMonthLabel(`${key}-01T12:00:00Z`);
}

/** "2026-07" — kunci pengelompokan per bulan, tetap dalam zona WIB. */
export function monthKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: JAKARTA,
  }).format(new Date(iso));
  return parts.slice(0, 7);
}

/** "2026-07-26" — tanggal dalam zona WIB, dipakai untuk perbandingan periode. */
export function dayKey(iso: string): string {
  return toDateInputValue(iso);
}

/** "2026-07-26" — nilai untuk <input type="date"> dalam zona WIB. */
export function toDateInputValue(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: JAKARTA,
  }).format(new Date(iso));
}

/** Kebalikan dari toDateInputValue: "2026-07-26" -> ISO tengah hari WIB. */
export function fromDateInputValue(value: string): string {
  // Jam 12.00 WIB dipilih supaya pergeseran zona waktu tidak pernah
  // memindahkan tanggalnya ke hari sebelum/sesudahnya.
  return new Date(`${value}T12:00:00+07:00`).toISOString();
}

export const SOURCE_LABEL: Record<TransactionSource, string> = {
  bca: "BCA",
  blu_bca: "Blu BCA",
  seabank: "SeaBank",
  shopeepay: "ShopeePay",
  ovo: "OVO",
  dana: "DANA",
  gopay: "GoPay",
  manual_cash: "Tunai",
  manual_other: "Manual",
};

/** Warna brand tiap sumber, dipakai untuk chip di daftar transaksi. */
export const SOURCE_STYLE: Record<TransactionSource, string> = {
  bca: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  blu_bca: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  seabank:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  shopeepay:
    "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  ovo: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  dana: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  gopay: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  manual_cash:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  manual_other:
    "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
};

export const OWNER_LABEL: Record<AccountOwner, string> = {
  husband: "Suami",
  wife: "Istri",
};

export const ORIGIN_LABEL: Record<TransactionOrigin, string> = {
  email: "Email",
  manual_web: "Input Web",
  manual_wa: "WhatsApp",
};

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  low_confidence_extraction: "Ekstraksi kurang yakin",
  fuzzy_internal_match: "Cocok nama (bukan no. rekening)",
  uncategorized: "Belum berkategori",
  manual_flag: "Ditandai manual",
};

export const CASH_ENTRY_LABEL: Record<CashWalletEntryType, string> = {
  withdrawal_credit: "Tarik tunai",
  manual_expense_debit: "Pengeluaran tunai",
  adjustment: "Penyesuaian",
};
