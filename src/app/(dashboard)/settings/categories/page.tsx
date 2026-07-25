"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/Modal";
import { IconPencil, IconPlus, IconTrash } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Toggle,
} from "@/components/ui";
import { formatIDR } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Category, CategoryKind } from "@/lib/types";

export default function CategoriesPage() {
  const {
    categories,
    transactions,
    cashEntries,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  // Pemakaian dihitung dari dua sumber: transaksi bank dan catatan tunai
  // manual — supaya kategori yang cuma dipakai di dompet tunai tidak
  // terlihat "kosong" lalu terhapus tanpa sadar.
  const usage = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    const bump = (id: string | null, amount: number) => {
      if (!id) return;
      const cur = map.get(id) ?? { count: 0, total: 0 };
      map.set(id, { count: cur.count + 1, total: cur.total + amount });
    };
    for (const t of transactions) {
      if (!t.isInternalTransfer) bump(t.categoryId, t.amount);
    }
    for (const e of cashEntries) {
      if (e.entryType === "manual_expense_debit") bump(e.categoryId, e.amount);
    }
    return map;
  }, [transactions, cashEntries]);

  const sections: { kind: CategoryKind; title: string; description: string }[] = [
    {
      kind: "expense",
      title: "Kategori Pengeluaran",
      description: "Dipilih otomatis oleh LLM untuk transaksi keluar",
    },
    {
      kind: "income",
      title: "Kategori Pemasukan",
      description: "Dipilih otomatis oleh LLM untuk transaksi masuk",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Kategori</h1>
          <p className="text-xs text-muted">
            {categories.filter((c) => c.isActive).length} kategori aktif
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
          Tambah kategori
        </Button>
      </div>

      <div className="rounded-xl border border-line bg-surface-muted/60 px-4 py-3 text-xs text-muted">
        Daftar ini bersifat tetap: LLM hanya boleh memilih salah satu kategori
        yang <strong className="text-foreground">aktif</strong> di sini, tidak
        boleh mengarang kategori baru — supaya laporan antar bulan tetap bisa
        dibandingkan. Kategori yang dinonaktifkan tidak akan dipakai lagi untuk
        transaksi baru, tapi transaksi lama tetap menyimpan labelnya.
      </div>

      {sections.map(({ kind, title, description }) => {
        const rows = categories
          .filter((c) => c.kind === kind)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return (
          <Card key={kind}>
            <CardHeader title={title} description={description} />
            <div className="divide-y divide-line">
              {rows.map((category) => {
                const stat = usage.get(category.id);
                return (
                  <div
                    key={category.id}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium">
                          {category.name}
                        </p>
                        {category.isSystem ? (
                          <Badge tone="info">Sistem</Badge>
                        ) : null}
                        {!category.isActive ? (
                          <Badge tone="neutral">Nonaktif</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {stat
                          ? `${stat.count} transaksi · ${formatIDR(stat.total)}`
                          : "Belum dipakai"}
                        {category.isSystem
                          ? " · otomatis dipakai untuk tarik tunai"
                          : ""}
                      </p>
                    </div>

                    <Toggle
                      label={`Aktifkan ${category.name}`}
                      checked={category.isActive}
                      onChange={(next) =>
                        updateCategory(category.id, { isActive: next })
                      }
                    />

                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        aria-label="Ubah"
                        disabled={category.isSystem}
                        onClick={() => {
                          setEditing(category);
                          setFormOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                      >
                        <IconPencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Hapus"
                        disabled={category.isSystem}
                        onClick={() => setDeleting(category)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-rose-600 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <IconTrash className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <CategoryForm
        open={formOpen}
        category={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(values) => {
          if (editing) updateCategory(editing.id, values);
          else
            addCategory({
              ...values,
              isSystem: false,
              isActive: true,
              sortOrder:
                Math.max(
                  0,
                  ...categories
                    .filter((c) => c.kind === values.kind)
                    .map((c) => c.sortOrder),
                ) + 1,
            });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteCategory(deleting.id)}
        title="Hapus kategori?"
        message={
          deleting ? (
            <>
              <strong className="text-foreground">{deleting.name}</strong> akan
              dihapus permanen.{" "}
              {usage.get(deleting.id)
                ? `${usage.get(deleting.id)!.count} transaksi yang memakainya akan jadi tanpa kategori.`
                : "Kategori ini belum dipakai transaksi manapun."}{" "}
              Kalau hanya ingin berhenti memakainya, lebih aman dinonaktifkan
              saja lewat tombol geser.
            </>
          ) : null
        }
      />
    </div>
  );
}

interface CategoryFormValues {
  name: string;
  kind: CategoryKind;
}

function CategoryForm({
  open,
  category,
  onClose,
  onSubmit,
}: {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSubmit: (values: CategoryFormValues) => void;
}) {
  if (!open) return null;
  return (
    <CategoryFormInner
      key={category?.id ?? "new"}
      category={category}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function CategoryFormInner({
  category,
  onClose,
  onSubmit,
}: {
  category: Category | null;
  onClose: () => void;
  onSubmit: (values: CategoryFormValues) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "expense");
  const [touched, setTouched] = useState(false);
  const valid = name.trim() !== "";

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? "Ubah kategori" : "Tambah kategori"}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true);
              if (!valid) return;
              onSubmit({ name: name.trim(), kind });
              onClose();
            }}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Nama kategori"
          hint={touched && !valid ? "Nama wajib diisi." : undefined}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Olahraga"
          />
        </Field>
        <Field
          label="Jenis"
          hint={
            category
              ? "Mengubah jenis akan memindahkan kategori ini ke daftar yang lain."
              : undefined
          }
        >
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
