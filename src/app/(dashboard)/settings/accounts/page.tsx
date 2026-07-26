"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/Modal";
import { IconPencil, IconPlus, IconTrash } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  Field,
  Input,
  Select,
  Toggle,
} from "@/components/ui";
import { SOURCE_LABEL, SOURCE_STYLE } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { BankSource, OwnAccount } from "@/lib/types";

const BANK_OPTIONS: BankSource[] = [
  "bca",
  "blu_bca",
  "seabank",
  "shopeepay",
  "ovo",
  "dana",
  "gopay",
];

export default function AccountsPage() {
  const {
    ownerNames,
    ownAccounts,
    transactions,
    addOwnAccount,
    updateOwnAccount,
    deleteOwnAccount,
  } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OwnAccount | null>(null);
  const [deleting, setDeleting] = useState<OwnAccount | null>(null);

  // Berapa transaksi yang sudah "diselamatkan" oleh tiap rekening — bukti
  // konkret bahwa daftar ini memang dipakai, bukan sekadar konfigurasi mati.
  const matchCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      if (!t.isInternalTransfer || !t.counterpartyAccountNumber) continue;
      const account = ownAccounts.find(
        (a) => a.accountNumberOrIdentifier === t.counterpartyAccountNumber,
      );
      if (account) counts.set(account.id, (counts.get(account.id) ?? 0) + 1);
    }
    return counts;
  }, [transactions, ownAccounts]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Rekening Sendiri
          </h1>
          <p className="text-xs text-muted">
            {ownAccounts.length} rekening & e-wallet terdaftar
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <IconPlus className="size-4" />
          Tambah rekening
        </Button>
      </div>

      <div className="rounded-xl border border-line bg-surface-muted/60 px-4 py-3 text-xs text-muted">
        Daftar ini adalah acuan utama sistem untuk mengenali transfer antar
        rekening milik sendiri. Kalau nomor rekening tujuan ada di sini,
        transaksinya otomatis{" "}
        <strong className="text-foreground">
          tidak dihitung sebagai pengeluaran
        </strong>
        . Semakin lengkap daftarnya, semakin sedikit transaksi yang perlu
        direview manual.
      </div>

      {ownAccounts.length === 0 ? (
        <Card>
          <EmptyState
            title="Belum ada rekening terdaftar"
            description="Tambahkan rekening & e-wallet milik Anda sendiri supaya perpindahan dana antar rekening Anda tidak terhitung sebagai pengeluaran."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Rekening & e-wallet Anda"
            description={`${ownAccounts.length} terdaftar`}
          />
          <div className="divide-y divide-line">
            {ownAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-3 px-4 py-3 sm:px-5"
              >
                <span
                  className={cn(
                    "flex h-9 shrink-0 items-center rounded-lg px-2.5 text-[11px] font-semibold",
                    SOURCE_STYLE[account.bank],
                  )}
                >
                  {SOURCE_LABEL[account.bank]}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">
                      {account.label}
                    </p>
                    {!account.isActive ? (
                      <Badge tone="neutral">Nonaktif</Badge>
                    ) : null}
                  </div>
                  <p className="tabular mt-0.5 text-[11px] text-muted">
                    {account.accountNumberOrIdentifier}
                    {matchCount.get(account.id) ? (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                        · {matchCount.get(account.id)} transfer dikenali
                      </span>
                    ) : null}
                  </p>
                </div>

                <Toggle
                  label={`Aktifkan ${account.label}`}
                  checked={account.isActive}
                  onChange={(next) =>
                    updateOwnAccount(account.id, { isActive: next })
                  }
                />
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    aria-label="Ubah"
                    onClick={() => {
                      setEditing(account);
                      setFormOpen(true);
                    }}
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                  >
                    <IconPencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Hapus"
                    onClick={() => setDeleting(account)}
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-rose-600"
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Pencocokan nama (cadangan)"
          description="Dipakai saat bank menyamarkan nomor rekening tujuan"
        />
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-muted">
            Sebagian notifikasi hanya menampilkan nama, misal{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5">
              HIKMAH Q*****
            </code>
            . Dalam kasus itu sistem mencocokkan kemiripan nama, lalu menandai
            transaksinya{" "}
            <strong className="text-foreground">perlu direview</strong> karena
            tingkat keyakinannya lebih rendah daripada cocok nomor rekening.
          </p>
          {ownerNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {ownerNames.map((name) => (
                <span
                  key={name}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              Belum ada nama terdaftar. Isi <code>OWNER_ACCOUNT_NAMES</code> di
              berkas <code>.env</code> (dipisah koma) agar pencocokan nama
              cadangan ini bisa bekerja.
            </p>
          )}
        </div>
      </Card>

      <AccountForm
        open={formOpen}
        account={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(values) => {
          if (editing) updateOwnAccount(editing.id, values);
          else addOwnAccount({ ...values, isActive: true });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteOwnAccount(deleting.id)}
        title="Hapus rekening dari daftar?"
        message={
          deleting ? (
            <>
              <strong className="text-foreground">{deleting.label}</strong> (
              {deleting.accountNumberOrIdentifier}) akan dihapus. Transfer ke
              rekening ini setelahnya akan terhitung sebagai pengeluaran biasa.
            </>
          ) : null
        }
      />
    </div>
  );
}

interface AccountFormValues {
  bank: BankSource;
  accountNumberOrIdentifier: string;
  label: string;
}

function AccountForm({
  open,
  account,
  onClose,
  onSubmit,
}: {
  open: boolean;
  account: OwnAccount | null;
  onClose: () => void;
  onSubmit: (values: AccountFormValues) => void;
}) {
  if (!open) return null;
  return (
    <AccountFormInner
      key={account?.id ?? "new"}
      account={account}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function AccountFormInner({
  account,
  onClose,
  onSubmit,
}: {
  account: OwnAccount | null;
  onClose: () => void;
  onSubmit: (values: AccountFormValues) => void;
}) {
  const [bank, setBank] = useState<BankSource>(account?.bank ?? "bca");
  const [number, setNumber] = useState(
    account?.accountNumberOrIdentifier ?? "",
  );
  const [label, setLabel] = useState(account?.label ?? "");
  const [touched, setTouched] = useState(false);

  const valid = number.trim() !== "" && label.trim() !== "";
  const isEwallet = ["gopay", "ovo", "dana", "shopeepay"].includes(bank);

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? "Ubah rekening" : "Tambah rekening sendiri"}
      description="Rekening milik Anda atau istri, di bank maupun e-wallet."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true);
              if (!valid) return;
              onSubmit({
                bank,
                accountNumberOrIdentifier: number.trim(),
                label: label.trim(),
              });
              onClose();
            }}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Bank / e-wallet">
          <Select
            value={bank}
            onChange={(e) => setBank(e.target.value as BankSource)}
          >
            {BANK_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {SOURCE_LABEL[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={isEwallet ? "Nomor HP terdaftar" : "Nomor rekening"}
          hint={
            touched && number.trim() === ""
              ? "Wajib diisi — ini kunci pencocokan transfer internal."
              : isEwallet
                ? "E-wallet dicocokkan lewat nomor HP yang terdaftar."
                : undefined
          }
        >
          <Input
            autoFocus
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={isEwallet ? "081234567890" : "1234567890"}
            className="tabular"
          />
        </Field>
        <Field
          label="Label"
          hint={
            touched && label.trim() === ""
              ? "Wajib diisi."
              : "Nama pendek agar mudah dikenali, misal “BCA Utama”."
          }
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="BCA Utama"
          />
        </Field>
      </div>
    </Modal>
  );
}
