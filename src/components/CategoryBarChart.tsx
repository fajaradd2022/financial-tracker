"use client";

import { formatIDR } from "@/lib/format";
import type { CategoryBreakdownRow } from "@/lib/store";
import { cn, Money } from "./ui";

/**
 * Bar chart horizontal untuk membandingkan besaran antar kategori.
 *
 * Pilihan bentuk & warna mengikuti panduan visualisasi data:
 * - Tugas datanya "bandingkan besaran", jadi bentuknya bar, bukan pie/donut.
 * - Satu seri = satu hue (bukan palet kategorikal). Warna di sini hanya
 *   penguat arti yang sudah dipakai di seluruh aplikasi (hijau = masuk,
 *   merah = keluar); identitas dibawa judul kartu dan label tiap baris,
 *   sehingga pembaca dengan buta warna merah-hijau tetap bisa membacanya.
 * - Setiap bar dilabeli nominal langsung — angka tidak pernah hanya
 *   dititipkan ke panjang bar.
 * - Bar bertopi bulat 4px di ujung data dan siku di garis dasar.
 */
export function CategoryBarChart({
  rows,
  tone,
  emptyLabel,
}: {
  rows: CategoryBreakdownRow[];
  tone: "income" | "expense";
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-xs text-muted">{emptyLabel}</p>
    );
  }

  // Skala relatif terhadap kategori terbesar, bukan terhadap total: perbedaan
  // antar kategori jadi jauh lebih terbaca saat satu kategori mendominasi.
  const max = Math.max(...rows.map((r) => r.total));

  return (
    <ul className="space-y-3 px-5 py-4">
      {rows.map((row) => (
        <li key={row.categoryId ?? "none"}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-xs font-medium">
              {row.name}
              <span className="ml-1.5 font-normal text-muted">
                {row.count}×
              </span>
            </span>
            <span className="tabular shrink-0 text-xs">
              <Money value={formatIDR(row.total)} />
              {/* Persentase & panjang bar tetap tampil saat nominal disamarkan:
                  proporsinya masih terbaca tanpa membocorkan angkanya. */}
              <span className="ml-1.5 text-muted">
                {Math.round(row.share * 100)}%
              </span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={cn(
                "h-full rounded-r-sm",
                tone === "income"
                  ? "bg-emerald-600 dark:bg-emerald-400"
                  : "bg-rose-600 dark:bg-rose-400",
              )}
              style={{ width: `${Math.max(2, (row.total / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
