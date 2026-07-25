"use client";

import { useState } from "react";
import {
  allPeriod,
  customPeriod,
  MONTH_LABELS,
  monthPeriod,
  yearPeriod,
  type Period,
  type PeriodMode,
} from "@/lib/period";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "./icons";
import { Button, cn, Field, Input } from "./ui";

/**
 * Pemilih periode: bulan, tahun, rentang tanggal bebas, atau semua.
 *
 * Dipakai bersama oleh dashboard, transaksi, dan dompet tunai supaya definisi
 * "periode" persis sama di ketiganya.
 */
export function PeriodPicker({
  value,
  onChange,
  availableYears,
  allowAll = true,
}: {
  value: Period;
  onChange: (next: Period) => void;
  /** Tahun yang punya data — jadi pilihan cepat di tab Tahun. */
  availableYears: number[];
  allowAll?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium transition-colors hover:bg-surface-muted"
      >
        <IconCalendar className="size-3.5 text-muted" />
        {value.label}
      </button>

      {open ? (
        <>
          {/* Latar penangkap klik: menutup popover tanpa perlu listener global. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Pilih periode"
            className="absolute right-0 z-50 mt-2 w-[19rem] rounded-xl border border-line bg-surface p-3 shadow-xl"
          >
            <PeriodPanel
              value={value}
              availableYears={availableYears}
              allowAll={allowAll}
              onPick={(next) => {
                onChange(next);
                setOpen(false);
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function PeriodPanel({
  value,
  availableYears,
  allowAll,
  onPick,
}: {
  value: Period;
  availableYears: number[];
  allowAll: boolean;
  onPick: (next: Period) => void;
}) {
  const fallbackYear =
    availableYears[0] ?? Number(new Date().toISOString().slice(0, 4));
  const [tab, setTab] = useState<PeriodMode>(
    value.mode === "all" ? "month" : value.mode,
  );
  const [year, setYear] = useState(
    () => Number(value.startDay?.slice(0, 4)) || fallbackYear,
  );
  const [from, setFrom] = useState(value.startDay ?? "");
  const [to, setTo] = useState(value.endDay ?? "");

  const selectedMonth =
    value.mode === "month" && value.startDay?.startsWith(String(year))
      ? Number(value.startDay.slice(5, 7))
      : null;

  const TABS: { id: PeriodMode; label: string }[] = [
    { id: "month", label: "Bulan" },
    { id: "year", label: "Tahun" },
    { id: "custom", label: "Rentang" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-surface-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "month" ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Tahun sebelumnya"
              onClick={() => setYear((y) => y - 1)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"
            >
              <IconChevronLeft className="size-3.5" />
            </button>
            <span className="tabular text-xs font-semibold">{year}</span>
            <button
              type="button"
              aria-label="Tahun berikutnya"
              onClick={() => setYear((y) => y + 1)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"
            >
              <IconChevronRight className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MONTH_LABELS.map((label, i) => {
              const month = i + 1;
              const active = selectedMonth === month;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onPick(monthPeriod(year, month))}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "year" ? (
        <div className="grid grid-cols-3 gap-1">
          {(availableYears.length > 0 ? availableYears : [fallbackYear]).map(
            (y) => (
              <button
                key={y}
                type="button"
                onClick={() => onPick(yearPeriod(y))}
                className={cn(
                  "tabular rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                  value.mode === "year" && value.startDay?.startsWith(String(y))
                    ? "bg-indigo-600 text-white"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {y}
              </button>
            ),
          )}
        </div>
      ) : null}

      {tab === "custom" ? (
        <div className="space-y-2.5">
          <Field label="Dari tanggal">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Sampai tanggal">
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Button
            variant="primary"
            size="sm"
            disabled={!from || !to}
            className="w-full"
            onClick={() => onPick(customPeriod(from, to))}
          >
            Terapkan rentang
          </Button>
        </div>
      ) : null}

      {allowAll ? (
        <button
          type="button"
          onClick={() => onPick(allPeriod())}
          className={cn(
            "w-full rounded-lg border border-line px-2 py-2 text-xs font-medium transition-colors",
            value.mode === "all"
              ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
              : "text-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          Semua periode
        </button>
      ) : null}
    </div>
  );
}
