"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useStore } from "@/lib/store";
import { BalanceToggle } from "./BalanceToggle";
import {
  IconBank,
  IconCash,
  IconClose,
  IconDashboard,
  IconLogout,
  IconMenu,
  IconSettings,
  IconTag,
  IconTransactions,
  IconUsers,
} from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "./ui";

interface NavItem {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  children?: { href: string; label: string; Icon: NavItem["Icon"] }[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/transactions", label: "Transaksi", Icon: IconTransactions },
  { href: "/cash", label: "Dompet Tunai", Icon: IconCash },
  { href: "/collaboration", label: "Kolaborasi", Icon: IconUsers },
  {
    href: "/settings",
    label: "Pengaturan",
    Icon: IconSettings,
    children: [
      { href: "/settings", label: "Umum & Ingestion", Icon: IconSettings },
      { href: "/settings/accounts", label: "Rekening Sendiri", Icon: IconBank },
      { href: "/settings/categories", label: "Kategori", Icon: IconTag },
      { href: "/settings/users", label: "Pengguna", Icon: IconUsers },
    ],
  },
];

export interface SessionUser {
  name: string;
  email: string;
  role?: string | null;
}

/**
 * Lencana hanya untuk hal yang menunggu TINDAKAN user, bukan sekadar hitungan.
 * Kalau semua menu dilencanai, lencananya berhenti berarti apa-apa.
 */
function badgeFor(
  href: string,
  reviewCount: number,
  pendingCollab: number,
): number | null {
  if (href === "/transactions") return reviewCount > 0 ? reviewCount : null;
  if (href === "/collaboration") return pendingCollab > 0 ? pendingCollab : null;
  return null;
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: SessionUser;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    // h-dvh + overflow-hidden mengunci tinggi layar: sidebar & topbar tidak
    // pernah ikut bergulir, hanya <main> yang punya scroll sendiri.
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        user={user}
        className="hidden w-60 shrink-0 border-r border-line bg-surface lg:flex"
      />

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <Sidebar
            user={user}
            className="relative flex h-full w-64 border-r border-line bg-surface"
            onClose={() => setMobileOpen(false)}
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  className,
  onClose,
  user,
}: {
  className?: string;
  onClose?: () => void;
  user: SessionUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { transactions, collaborationEntries, currentUserId } = useStore();
  const [signingOut, setSigningOut] = useState(false);
  const reviewCount = transactions.filter((t) => t.needsReview).length;
  // Entri yang menunggu TINDAKAN saya — bukan yang saya kirim ke orang lain.
  const pendingCollab = collaborationEntries.filter(
    (e) => e.toUserId === currentUserId && e.status === "pending_match",
  ).length;

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className={cn("flex-col", className)}>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
            FT
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Financial Tracker
          </span>
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"
          >
            <IconClose />
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map((item) => {
          const sectionActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                // Di layar kecil drawer harus menutup begitu tujuan dipilih,
                // kalau tidak ia menutupi halaman yang baru dibuka.
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  sectionActive
                    ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <item.Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {badgeFor(item.href, reviewCount, pendingCollab) ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                    {badgeFor(item.href, reviewCount, pendingCollab)}
                  </span>
                ) : null}
              </Link>

              {/* Sub-menu hanya muncul saat sedang berada di seksinya, supaya
                  daftar navigasi tidak panjang tanpa alasan. */}
              {item.children && sectionActive ? (
                <div className="mt-0.5 ml-4 space-y-0.5 border-l border-line pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                        pathname === child.href
                          ? "font-medium text-indigo-700 dark:text-indigo-300"
                          : "text-muted hover:bg-surface-muted hover:text-foreground",
                      )}
                    >
                      <child.Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{child.label}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold uppercase">
            {user.name.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Keluar"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
          >
            <IconLogout />
          </button>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const current =
    NAV.flatMap((n) => n.children ?? [n]).find((n) => pathname === n.href) ??
    NAV.find((n) => pathname.startsWith(`${n.href}/`));

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Buka menu"
        className="rounded-lg p-1.5 text-muted hover:bg-surface-muted lg:hidden"
      >
        <IconMenu className="size-5" />
      </button>
      <h1 className="flex-1 truncate text-sm font-semibold tracking-tight">
        {current?.label ?? "Financial Tracker"}
      </h1>
      {/* Di bilah atas supaya tersedia di semua tab, bukan diduplikasi
          per halaman. */}
      <BalanceToggle />
      <ThemeToggle />
    </header>
  );
}
