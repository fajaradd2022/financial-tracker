"use client";

import { THEME_KEY } from "@/lib/preferences";
import { IconMoon, IconSun } from "./icons";

/**
 * Tema tidak disimpan di state React sama sekali: sumber kebenarannya class
 * `dark` di <html>, yang sudah dipasang skrip pra-hydration (lihat
 * `lib/preferences.ts`). Ikon mana yang tampil diatur CSS, jadi tampilannya
 * benar sejak render pertama tanpa efek penyelaras.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // preferensi tema tidak kritis kalau gagal disimpan
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Ganti tema terang/gelap"
      className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <IconMoon className="size-4 dark:hidden" />
      <IconSun className="hidden size-4 dark:block" />
    </button>
  );
}
