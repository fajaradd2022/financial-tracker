"use client";

import { useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "./icons";
import { cn, Select } from "./ui";

export type PageSize = number | "all";

const PAGE_SIZES: { value: string; label: string }[] = [
  { value: "10", label: "10 baris" },
  { value: "30", label: "30 baris" },
  { value: "50", label: "50 baris" },
  { value: "all", label: "Semua" },
];

/**
 * Memotong daftar jadi per halaman.
 *
 * Halaman aktif diturunkan (`Math.min`) alih-alih dikoreksi lewat efek: saat
 * filter menyusutkan data sampai halaman 5 tidak ada lagi, hasilnya langsung
 * halaman terakhir yang valid pada render yang sama — tanpa render kosong
 * sekejap yang muncul kalau koreksinya baru terjadi setelah efek berjalan.
 */
export function usePaginated<T>(rows: T[], defaultSize: PageSize = 10) {
  const [pageSize, setPageSize] = useState<PageSize>(defaultSize);
  const [requestedPage, setRequestedPage] = useState(1);

  return useMemo(() => {
    const total = rows.length;
    const size = pageSize === "all" ? Math.max(total, 1) : pageSize;
    const pageCount = Math.max(1, Math.ceil(total / size));
    const page = Math.min(Math.max(1, requestedPage), pageCount);
    const from = (page - 1) * size;

    return {
      rows: rows.slice(from, from + size),
      page,
      pageCount,
      pageSize,
      total,
      rangeFrom: total === 0 ? 0 : from + 1,
      rangeTo: Math.min(from + size, total),
      setPage: setRequestedPage,
      setPageSize: (next: PageSize) => {
        setPageSize(next);
        setRequestedPage(1);
      },
    };
  }, [rows, pageSize, requestedPage]);
}

export function PaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  rangeFrom,
  rangeTo,
  onPageChange,
  onPageSizeChange,
  itemLabel = "baris",
}: {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  total: number;
  rangeFrom: number;
  rangeTo: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  itemLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2">
        <Select
          value={String(pageSize)}
          onChange={(e) =>
            onPageSizeChange(
              e.target.value === "all" ? "all" : Number(e.target.value),
            )
          }
          className="h-8 w-auto text-xs"
          aria-label="Jumlah baris per halaman"
        >
          {PAGE_SIZES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <span className="text-[11px] text-muted">
          {total === 0
            ? `Tidak ada ${itemLabel}`
            : `${rangeFrom}–${rangeTo} dari ${total} ${itemLabel}`}
        </span>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <PageButton
            label="Halaman sebelumnya"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <IconChevronLeft className="size-3.5" />
          </PageButton>
          <span className="tabular px-2 text-[11px] text-muted">
            {page} / {pageCount}
          </span>
          <PageButton
            label="Halaman berikutnya"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <IconChevronRight className="size-3.5" />
          </PageButton>
        </div>
      ) : null}
    </div>
  );
}

function PageButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-line p-1.5 transition-colors",
        disabled
          ? "opacity-40"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
