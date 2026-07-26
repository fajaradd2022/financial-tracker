"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CategoryBarChart } from "@/components/CategoryBarChart";
import {
  IconAlert,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCash,
  IconSwap,
} from "@/components/icons";
import { PeriodPicker } from "@/components/PeriodPicker";
import { TransactionRow } from "@/components/TransactionRow";
import { Badge, Card, CardHeader, cn, Money } from "@/components/ui";
import { formatIDR } from "@/lib/format";
import { defaultPeriod, isInPeriod } from "@/lib/period";
import {
  availableYears,
  categoryBreakdown,
  summarizePeriod,
  useStore,
} from "@/lib/store";

export default function DashboardPage() {
  const {
    transactions,
    categories,
    cashEntries,
    cashBalance,
    categoryById,
    collaborationSummaries,
  } = useStore();

  const latest = useMemo(
    () =>
      transactions.reduce<string | undefined>(
        (max, t) => (!max || t.occurredAt > max ? t.occurredAt : max),
        undefined,
      ),
    [transactions],
  );
  const [period, setPeriod] = useState(() => defaultPeriod(latest));

  const years = useMemo(
    () => availableYears(transactions.map((t) => t.occurredAt)),
    [transactions],
  );

  const summary = useMemo(
    () => summarizePeriod(transactions, period),
    [transactions, period],
  );
  const expenseByCategory = useMemo(
    () => categoryBreakdown(transactions, categories, period, "out"),
    [transactions, categories, period],
  );
  const incomeByCategory = useMemo(
    () => categoryBreakdown(transactions, categories, period, "in"),
    [transactions, categories, period],
  );

  const reviewCount = transactions.filter((t) => t.needsReview).length;

  // Rekonsiliasi tunai periode berjalan: berapa yang ditarik vs berapa yang
  // sudah dicatat pemakaiannya. Selisihnya = tunai yang belum dijelaskan.
  const cashThisPeriod = useMemo(() => {
    const rows = cashEntries.filter((e) => isInPeriod(e.occurredAt, period));
    const withdrawn = rows
      .filter((e) => e.entryType !== "manual_expense_debit")
      .reduce((s, e) => s + e.amount, 0);
    const spent = rows
      .filter((e) => e.entryType === "manual_expense_debit")
      .reduce((s, e) => s + e.amount, 0);
    return { withdrawn, spent, unexplained: withdrawn - spent };
  }, [cashEntries, period]);

  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 5),
    [transactions],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Ringkasan</h1>
          <p className="text-xs text-muted">Periode {period.label}</p>
        </div>
        <PeriodPicker
          value={period}
          onChange={setPeriod}
          availableYears={years}
        />
      </div>

      {cashBalance < 0 ? (
        <Alert
          tone="danger"
          title="Saldo dompet tunai minus"
          body={
            <>
              Pengeluaran tunai yang dicatat lebih besar{" "}
              <Money value={formatIDR(Math.abs(cashBalance))} /> dari total tarik
              tunai. Kemungkinan ada penarikan yang belum tercatat, atau nominal
              input yang keliru.
            </>
          }
          href="/cash"
          cta="Cek dompet tunai"
        />
      ) : null}
      {reviewCount > 0 ? (
        <Alert
          tone="warning"
          title={`${reviewCount} transaksi perlu direview`}
          body="Hasil ekstraksi kurang yakin atau transfer internal yang cuma cocok lewat nama. Angkanya sudah ikut terhitung — tinggal dipastikan benar."
          href="/transactions?review=1"
          cta="Lihat antrean"
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pemasukan"
          value={summary.income}
          tone="income"
          icon={<IconArrowDownLeft />}
        />
        <StatCard
          label="Pengeluaran"
          value={summary.expense}
          tone="expense"
          icon={<IconArrowUpRight />}
        />
        <StatCard
          label="Selisih"
          value={summary.net}
          tone={summary.net >= 0 ? "income" : "expense"}
          icon={<IconSwap />}
          hint={summary.net >= 0 ? "Surplus periode ini" : "Defisit periode ini"}
        />
        <StatCard
          label="Saldo dompet tunai"
          value={cashBalance}
          tone={cashBalance < 0 ? "expense" : "neutral"}
          icon={<IconCash />}
          hint="Akumulasi semua periode"
        />
      </div>

      {collaborationSummaries.length > 0 ? (
        <Card>
          <CardHeader
            title="Kolaborasi"
            description="Saldo kantong akumulatif, tidak direset per periode"
            action={
              <Link
                href="/collaboration"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Kelola
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-136 text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-muted">
                  <th className="px-5 py-2 font-medium">Kolaborator</th>
                  <th className="px-3 py-2 font-medium">Arah</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Diberi/Diterima
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Terpakai</th>
                  <th className="px-5 py-2 text-right font-medium">Sisa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {collaborationSummaries.map((s) => (
                  <tr key={s.collaborationId}>
                    <td className="max-w-48 truncate px-5 py-2.5 font-medium">
                      {s.partnerName}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={s.direction === "out" ? "danger" : "success"}>
                        {s.direction === "out" ? "keluar →" : "← masuk"}
                      </Badge>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      <Money value={formatIDR(s.total)} />
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      <Money value={formatIDR(s.spent)} />
                    </td>
                    <td
                      className={cn(
                        "tabular px-5 py-2.5 text-right font-semibold",
                        s.remaining < 0 && "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      <Money value={formatIDR(s.remaining)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Pemasukan per kategori"
            description={
              <>
                Total <Money value={formatIDR(summary.income)} /> ·{" "}
                {period.label}
              </>
            }
          />
          <CategoryBarChart
            rows={incomeByCategory}
            tone="income"
            emptyLabel="Belum ada pemasukan pada periode ini."
          />
        </Card>

        <Card>
          <CardHeader
            title="Pengeluaran per kategori"
            description={
              <>
                Total <Money value={formatIDR(summary.expense)} /> · transfer
                internal tidak dihitung
              </>
            }
          />
          <CategoryBarChart
            rows={expenseByCategory}
            tone="expense"
            emptyLabel="Belum ada pengeluaran pada periode ini."
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="5 transaksi terakhir"
            description="Diambil otomatis dari email notifikasi bank & e-wallet"
            action={
              <Link
                href="/transactions"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Lihat semua
              </Link>
            }
          />
          <div className="divide-y divide-line">
            {recent.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                category={categoryById(t.categoryId)}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Rekonsiliasi tunai" description={period.label} />
            <div className="space-y-3 px-5 py-4 text-sm">
              <Row
                label="Tarik tunai"
                value={formatIDR(cashThisPeriod.withdrawn)}
              />
              <Row
                label="Sudah dicatat"
                prefix="− "
                value={formatIDR(cashThisPeriod.spent)}
              />
              <div className="border-t border-line pt-3">
                <Row
                  label="Belum dijelaskan"
                  value={formatIDR(cashThisPeriod.unexplained)}
                  strong
                />
              </div>
              <p className="text-[11px] text-muted">
                Sisa ini uang tunai yang sudah ditarik tapi belum dicatat dipakai
                untuk apa.
              </p>
              <Link
                href="/cash"
                className="inline-flex text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Catat pengeluaran tunai →
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Transfer internal"
              description="Dikecualikan dari total"
            />
            <div className="px-5 py-4">
              <p className="tabular text-xl font-semibold">
                <Money value={formatIDR(summary.internalTransferTotal)} />
              </p>
              <p className="mt-1 text-xs text-muted">
                {summary.internalTransferCount} transaksi antar rekening milik
                sendiri (Anda & istri) pada periode ini — tidak dihitung sebagai
                pengeluaran maupun pemasukan.
              </p>
              <Link
                href="/settings/accounts"
                className="mt-3 inline-flex text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Kelola daftar rekening →
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Status periode" />
            <div className="space-y-2.5 px-5 py-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Total transaksi</span>
                <span className="tabular font-medium">
                  {summary.transactionCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Perlu review</span>
                {reviewCount > 0 ? (
                  <Badge tone="warning">{reviewCount}</Badge>
                ) : (
                  <Badge tone="success">Bersih</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Tarik tunai</span>
                <span className="tabular font-medium">
                  <Money value={formatIDR(summary.cashWithdrawn)} />
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  prefix,
  strong,
}: {
  label: string;
  value: string;
  /** Tanda seperti "− " yang tetap tampil walau nominalnya disamarkan. */
  prefix?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("tabular text-sm", strong && "font-semibold")}>
        <Money value={value} prefix={prefix} />
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: number;
  tone: "income" | "expense" | "neutral";
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            tone === "income"
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
              : tone === "expense"
                ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
                : "bg-surface-muted text-muted",
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "tabular mt-2 text-xl font-semibold tracking-tight",
          tone === "income" && "text-emerald-600 dark:text-emerald-400",
          tone === "expense" && "text-rose-600 dark:text-rose-400",
        )}
      >
        <Money value={formatIDR(value)} />
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </Card>
  );
}

function Alert({
  tone,
  title,
  body,
  href,
  cta,
}: {
  tone: "danger" | "warning";
  title: string;
  body: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        tone === "danger"
          ? "border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tone === "danger"
            ? "text-rose-600 dark:text-rose-400"
            : "text-amber-600 dark:text-amber-400",
        )}
      >
        <IconAlert />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{body}</p>
      </div>
      <Link
        href={href}
        className="shrink-0 self-center text-xs font-medium whitespace-nowrap text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {cta}
      </Link>
    </div>
  );
}
