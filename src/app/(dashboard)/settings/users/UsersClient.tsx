"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog, Modal } from "@/components/Modal";
import { IconPlus, IconTrash } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/format";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt: string;
}

/**
 * Bagian interaktif manajemen pengguna.
 *
 * Semua mutasi memanggil endpoint Better Auth yang memverifikasi ulang hak
 * admin di server — UI ini hanya lapisan tampilan, bukan penjaga keamanannya.
 * Setelah mutasi, `router.refresh()` menarik ulang data dari server component.
 */
export function UsersClient({
  users,
  error,
  currentUserId,
}: {
  users: ManagedUser[];
  error: string | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function withRefresh(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    await action();
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Pengguna</h1>
          <p className="text-xs text-muted">
            Akun yang boleh masuk ke aplikasi ini
          </p>
        </div>
        {error ? null : (
          <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
            <IconPlus className="size-3.5" />
            Tambah pengguna
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface-muted/60 px-4 py-3 text-xs text-muted">
        Pendaftaran mandiri dimatikan — akun hanya bisa dibuat dari halaman ini.
        Peran <strong className="text-foreground">admin</strong> boleh mengelola
        pengguna lain; <strong className="text-foreground">user</strong> hanya
        memakai aplikasi.
      </div>

      <Card>
        <CardHeader
          title="Daftar akun"
          description={error ? undefined : `${users.length} akun terdaftar`}
        />

        {error ? (
          <EmptyState
            title="Tidak bisa menampilkan pengguna"
            description={error}
          />
        ) : users.length === 0 ? (
          <EmptyState title="Belum ada pengguna" />
        ) : (
          <div className="divide-y divide-line">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const busy = busyId === user.id;
              return (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold uppercase">
                    {user.name.slice(0, 2)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      {user.role === "admin" ? (
                        <Badge tone="brand">Admin</Badge>
                      ) : null}
                      {isSelf ? <Badge tone="neutral">Anda</Badge> : null}
                      {user.banned ? <Badge tone="danger">Nonaktif</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {user.email} · dibuat {formatDateTime(user.createdAt)}
                    </p>
                  </div>

                  <Select
                    value={user.role === "admin" ? "admin" : "user"}
                    // Akun sendiri tidak boleh diturunkan perannya — cara paling
                    // umum mengunci diri sendiri keluar dari halaman ini.
                    disabled={isSelf || busy}
                    onChange={(e) =>
                      withRefresh(user.id, () =>
                        authClient.admin.setRole({
                          userId: user.id,
                          role: e.target.value as "admin" | "user",
                        }),
                      )
                    }
                    className="h-8 w-auto text-xs"
                    aria-label={`Peran ${user.name}`}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </Select>

                  <Button
                    size="sm"
                    disabled={isSelf || busy}
                    onClick={() =>
                      withRefresh(user.id, () =>
                        user.banned
                          ? authClient.admin.unbanUser({ userId: user.id })
                          : authClient.admin.banUser({
                              userId: user.id,
                              banReason: "Dinonaktifkan oleh admin",
                            }),
                      )
                    }
                  >
                    {user.banned ? "Aktifkan" : "Nonaktifkan"}
                  </Button>

                  <button
                    type="button"
                    aria-label="Hapus"
                    disabled={isSelf || busy}
                    onClick={() => setDeleting(user)}
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-rose-600 disabled:pointer-events-none disabled:opacity-30"
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {formOpen ? (
        <CreateUserForm
          onClose={() => setFormOpen(false)}
          onCreated={() => router.refresh()}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          void withRefresh(deleting.id, () =>
            authClient.admin.removeUser({ userId: deleting.id }),
          );
        }}
        title="Hapus pengguna?"
        message={
          deleting ? (
            <>
              Akun <strong className="text-foreground">{deleting.email}</strong>{" "}
              akan dihapus permanen dan tidak bisa login lagi. Kalau hanya ingin
              menutup akses sementara, gunakan “Nonaktifkan”.
            </>
          ) : null
        }
      />
    </div>
  );
}

function CreateUserForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const valid =
    name.trim() !== "" && /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  async function submit() {
    setPending(true);
    setError(null);
    const { error: createError } = await authClient.admin.createUser({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
    });
    setPending(false);
    if (createError) {
      setError(
        createError.message ??
          "Gagal membuat pengguna. Mungkin emailnya sudah terpakai.",
      );
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Tambah pengguna"
      description="Akun baru langsung bisa dipakai login."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" disabled={!valid || pending} onClick={submit}>
            {pending ? "Menyimpan…" : "Buat akun"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nama">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Annisa Putri"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
          />
        </Field>
        <Field
          label="Password"
          hint="Minimal 8 karakter. Sampaikan ke pengguna lewat jalur aman."
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Peran">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "user")}
          >
            <option value="user">User — hanya memakai aplikasi</option>
            <option value="admin">Admin — boleh mengelola pengguna</option>
          </Select>
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
