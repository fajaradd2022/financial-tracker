"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog, Modal } from "@/components/Modal";
import { IconKey, IconPlus, IconTrash } from "@/components/icons";
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
} from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { formatDate, formatDateTime } from "@/lib/format";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt: string;
  transactionCount: number;
  lastActivityAt: string | null;
  ingestionEnabled: boolean;
  ingestionConfigured: boolean;
  lastPolledAt: string | null;
  collaborationCount: number;
}

export interface InstanceStats {
  totalTransactions: number;
  activeCollaborations: number;
  usersWithIngestion: number;
}

/**
 * Bagian interaktif manajemen pengguna.
 *
 * Semua mutasi memanggil endpoint Better Auth yang memverifikasi ulang hak
 * admin di server — UI ini hanya lapisan tampilan, bukan penjaga keamanannya.
 * Setelah mutasi, `router.refresh()` menarik ulang data dari server component.
 *
 * Sengaja TIDAK ada fitur "login sebagai user". Better Auth menyediakannya,
 * tapi di aplikasi keuangan itu berarti admin bisa membuka seluruh isi keuangan
 * siapa pun tanpa jejak yang jelas. Yang ditampilkan di sini cukup untuk
 * menjawab "kenapa data user X tidak masuk" tanpa membuka isi dompetnya.
 */
export function UsersClient({
  users,
  instanceStats,
  error,
  currentUserId,
}: {
  users: ManagedUser[];
  instanceStats: InstanceStats | null;
  error: string | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
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

      {instanceStats ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Tile label="Akun" value={String(users.length)} />
          <Tile
            label="Ingestion aktif"
            value={`${instanceStats.usersWithIngestion} akun`}
          />
          <Tile
            label="Transaksi terproses"
            value={instanceStats.totalTransactions.toLocaleString("id-ID")}
          />
          <Tile
            label="Kolaborasi aktif"
            value={String(instanceStats.activeCollaborations)}
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-line bg-surface-muted/60 px-4 py-3 text-xs text-muted">
        Pendaftaran mandiri dimatikan — akun hanya bisa dibuat dari halaman ini.
        Peran <strong className="text-foreground">admin</strong> boleh mengelola
        pengguna lain; <strong className="text-foreground">user</strong> hanya
        memakai aplikasi. Halaman ini menampilkan status operasional saja —{" "}
        <strong className="text-foreground">isi transaksi tiap akun tidak
        bisa dilihat admin</strong>.
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
                <div key={user.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold uppercase">
                      {user.name.slice(0, 2)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium">
                          {user.name}
                        </p>
                        {user.role === "admin" ? (
                          <Badge tone="brand">Admin</Badge>
                        ) : null}
                        {isSelf ? <Badge tone="neutral">Anda</Badge> : null}
                        {user.banned ? (
                          <Badge tone="danger">Nonaktif</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {user.email} · dibuat {formatDate(user.createdAt)}
                      </p>
                    </div>

                    <Select
                      value={user.role === "admin" ? "admin" : "user"}
                      // Akun sendiri tidak boleh diturunkan perannya — cara
                      // paling umum mengunci diri sendiri keluar dari sini.
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
                      disabled={busy}
                      onClick={() => setResetting(user)}
                    >
                      <IconKey className="size-3.5" />
                      Password
                    </Button>

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

                  {/* Status operasional — supaya akun yang ingestion-nya
                      diam-diam mati tidak lolos berminggu-minggu. */}
                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Meta
                      label="Ingestion"
                      value={
                        user.ingestionEnabled
                          ? "Aktif"
                          : user.ingestionConfigured
                            ? "Dijeda"
                            : "Belum disetel"
                      }
                      tone={
                        user.ingestionEnabled
                          ? "good"
                          : user.ingestionConfigured
                            ? "warn"
                            : "muted"
                      }
                    />
                    <Meta
                      label="Polling terakhir"
                      value={
                        user.lastPolledAt
                          ? formatDateTime(user.lastPolledAt)
                          : "Belum pernah"
                      }
                      tone={
                        user.ingestionEnabled && !user.lastPolledAt
                          ? "warn"
                          : "muted"
                      }
                    />
                    <Meta
                      label="Transaksi"
                      value={user.transactionCount.toLocaleString("id-ID")}
                    />
                    <Meta
                      label="Aktivitas terakhir"
                      value={
                        user.lastActivityAt
                          ? formatDate(user.lastActivityAt)
                          : "—"
                      }
                    />
                  </dl>
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

      {resetting ? (
        <ResetPasswordForm
          user={resetting}
          onClose={() => setResetting(null)}
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
              akan dihapus permanen beserta{" "}
              <strong className="text-foreground">
                {deleting.transactionCount} transaksi
              </strong>{" "}
              miliknya. Kalau hanya ingin menutup akses sementara, gunakan
              “Nonaktifkan”.
            </>
          ) : null
        }
      />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="tabular mt-1 text-base font-semibold">{value}</p>
    </Card>
  );
}

function Meta({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "muted";
}) {
  return (
    <div className="rounded-lg bg-surface-muted px-2.5 py-1.5">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-[11px] font-medium",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ResetPasswordForm({
  user,
  onClose,
}: {
  user: ManagedUser;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const valid = password.length >= 8;

  async function submit() {
    setPending(true);
    setError(null);
    const { error: setError_ } = await authClient.admin.setUserPassword({
      userId: user.id,
      newPassword: password,
    });
    setPending(false);
    if (setError_) {
      setError(setError_.message ?? "Gagal mengubah password.");
      return;
    }
    setDone(true);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Setel ulang password"
      description={`Untuk akun ${user.email}.`}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Selesai
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Batal</Button>
            <Button variant="primary" disabled={!valid || pending} onClick={submit}>
              {pending ? "Menyimpan…" : "Setel password"}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3">
          <p className="text-sm">Password berhasil diubah.</p>
          <p className="rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs break-all">
            {password}
          </p>
          <p className="text-[11px] text-muted">
            Sampaikan lewat jalur aman, lalu minta penggunanya segera mengganti
            sendiri. Password ini tidak bisa dilihat lagi setelah dialog ditutup.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field
            label="Password baru"
            hint="Minimal 8 karakter. Tidak ada email pemulihan di instalasi ini, jadi jalur inilah penggantinya."
          >
            <Input
              autoFocus
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
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
      )}
    </Modal>
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
      description="Akun baru langsung bisa dipakai login, lengkap dengan kategori bawaannya."
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
