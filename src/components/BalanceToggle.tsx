"use client";

import { BALANCE_KEY } from "@/lib/preferences";
import { IconEye, IconEyeOff } from "./icons";

/**
 * Tombol sembunyikan/tampilkan nominal ringkasan.
 *
 * Sumber kebenarannya atribut `data-balance` di <html>, yang sudah dipasang
 * skrip pra-hydration (lihat `lib/preferences.ts`) — bukan state React. Dengan
 * begitu nominal asli tidak pernah sempat ter-render walau satu frame saat
 * halaman dimuat dalam kondisi tersembunyi.
 *
 * Ikon dan label mana yang tampil diatur CSS, jadi benar sejak render pertama.
 */
export function BalanceToggle() {
  function toggle() {
    const root = document.documentElement;
    const nextHidden = root.getAttribute("data-balance") !== "hidden";

    if (nextHidden) root.setAttribute("data-balance", "hidden");
    else root.removeAttribute("data-balance");

    try {
      localStorage.setItem(BALANCE_KEY, nextHidden ? "1" : "0");
    } catch {
      // Kalau localStorage tidak bisa ditulis, toggle tetap bekerja untuk sesi
      // ini — hanya pilihannya yang tidak diingat saat dibuka lagi.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {/* Nama aksesibel tombol ikut berganti karena elemen ber-display:none
          tidak dibacakan pembaca layar. */}
      <span className="balance-shown-only">
        <IconEye className="size-4" />
        <span className="sr-only">Sembunyikan nominal</span>
      </span>
      <span className="balance-hidden-only">
        <IconEyeOff className="size-4" />
        <span className="sr-only">Tampilkan nominal</span>
      </span>
    </button>
  );
}
