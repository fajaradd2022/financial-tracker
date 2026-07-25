import { dayKey, monthKeyToLabel } from "./format";

/**
 * Model periode untuk semua filter waktu (dashboard, transaksi, dompet tunai).
 *
 * Batas periode disimpan sebagai string "YYYY-MM-DD" dalam zona WIB, bukan
 * objek Date atau timestamp. Alasannya: perbandingannya jadi perbandingan
 * string biasa yang selalu benar, tanpa aritmatika zona waktu yang gampang
 * meleset sehari di sekitar tengah malam.
 */
export type PeriodMode = "month" | "year" | "custom" | "all";

export interface Period {
  mode: PeriodMode;
  /** Inklusif. null hanya saat mode "all". */
  startDay: string | null;
  /** Inklusif. null hanya saat mode "all". */
  endDay: string | null;
  label: string;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export const MONTH_LABELS = MONTHS_SHORT;

/** Jumlah hari dalam sebuah bulan (bulan 1-12). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthPeriod(year: number, month: number): Period {
  const mm = String(month).padStart(2, "0");
  return {
    mode: "month",
    startDay: `${year}-${mm}-01`,
    endDay: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
    label: monthKeyToLabel(`${year}-${mm}`),
  };
}

export function yearPeriod(year: number): Period {
  return {
    mode: "year",
    startDay: `${year}-01-01`,
    endDay: `${year}-12-31`,
    label: `Tahun ${year}`,
  };
}

export function customPeriod(startDay: string, endDay: string): Period {
  // Dibalik kalau user memilih tanggal akhir lebih dulu.
  const [from, to] =
    startDay <= endDay ? [startDay, endDay] : [endDay, startDay];
  return {
    mode: "custom",
    startDay: from,
    endDay: to,
    label: `${formatDayShort(from)} – ${formatDayShort(to)}`,
  };
}

export function allPeriod(): Period {
  return { mode: "all", startDay: null, endDay: null, label: "Semua periode" };
}

/** "2026-07-26" -> "26 Jul 2026" tanpa membuat objek Date (murni string). */
function formatDayShort(day: string): string {
  const [y, m, d] = day.split("-");
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`;
}

export function isInPeriod(iso: string, period: Period): boolean {
  if (period.mode === "all") return true;
  const day = dayKey(iso);
  return day >= period.startDay! && day <= period.endDay!;
}

/**
 * Bulan berjalan menurut zona WIB.
 *
 * Zona waktunya penting: menjelang tengah malam WIB, tanggal UTC masih hari
 * (dan kadang bulan) sebelumnya — memakai waktu lokal server akan memilih
 * bulan yang salah bagi pengguna di Indonesia.
 */
export function currentMonthPeriod(): Period {
  const [y, m] = dayKey(new Date().toISOString()).split("-");
  return monthPeriod(Number(y), Number(m));
}

/** Periode default: bulan dari transaksi terbaru, atau bulan berjalan. */
export function defaultPeriod(latestIso?: string): Period {
  if (!latestIso) return currentMonthPeriod();
  const [y, m] = dayKey(latestIso).split("-");
  return monthPeriod(Number(y), Number(m));
}
