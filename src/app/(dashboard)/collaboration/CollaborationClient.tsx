"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog, Modal } from "@/components/Modal";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconPlus,
  IconTrash,
  IconUsers,
} from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  Field,
  Input,
  Money,
  Select,
} from "@/components/ui";
import {
  acceptCollaborationEntryAction,
  deleteCollaborationAction,
  deleteCollaborationEntryAction,
  inviteCollaboratorAction,
  linkCollaborationEntryAction,
  rejectCollaborationEntryAction,
  respondToInvitationAction,
  revokeCollaborationAction,
} from "@/app/collaboration-actions";
import { formatDate, formatIDR } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Collaboration, CollaborationEntry, Transaction } from "@/lib/types";

export function CollaborationClient({
  linkableIncome,
}: {
  linkableIncome: Transaction[];
}) {
  const router = useRouter();
  const {
    collaborations,
    collaborationEntries,
    collaborationSummaries,
    currentUserId,
  } = useStore();
  const [pending, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linking, setLinking] = useState<CollaborationEntry | null>(null);
  const [revoking, setRevoking] = useState<Collaboration | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<CollaborationEntry | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : (result.message ?? "Gagal."));
      router.refresh();
    });
  }

  const accepted = collaborations.filter((c) => c.status === "accepted");
  // Undangan yang menunggu jawaban SAYA — bukan yang saya kirim.
  const incoming = collaborations.filter(
    (c) => c.status === "pending" && !c.isRequester,
  );
  const outgoing = collaborations.filter(
    (c) => c.status === "pending" && c.isRequester,
  );
  // Hubungan yang diputus tetap ditampilkan selama riwayatnya masih ada —
  // kalau disembunyikan, user tidak punya jalan untuk menghapus riwayat itu
  // belakangan, dan tidak tahu kenapa entri lamanya masih muncul.
  const revoked = collaborations.filter((c) => c.status === "revoked");

  const waitingForMe = collaborationEntries.filter(
    (e) => e.toUserId === currentUserId && e.status === "pending_match",
  );
  const sentByMe = collaborationEntries.filter(
    (e) => e.fromUserId === currentUserId,
  );

  const partnerName = (collaborationId: string) =>
    collaborations.find((c) => c.id === collaborationId)?.partnerName ??
    "kolaborator";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Kolaborasi</h1>
          <p className="text-xs text-muted">
            Berbagi uang dengan pengguna lain, dengan catatan yang saling
            terhubung
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setInviteOpen(true)}
          disabled={pending}
        >
          <IconPlus className="size-3.5" />
          Undang kolaborator
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {error}
        </p>
      ) : null}

      {/* Undangan masuk didahulukan: ini satu-satunya bagian yang menunggu
          tindakan orang lain, jadi tidak boleh terkubur di bawah. */}
      {incoming.length > 0 ? (
        <Card className="border-indigo-200 dark:border-indigo-500/30">
          <CardHeader
            title="Undangan masuk"
            description="Sebelum diterima, tidak ada apa pun yang masuk ke buku keuangan Anda"
          />
          <div className="divide-y divide-line">
            {incoming.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.partnerName}</p>
                  <p className="truncate text-[11px] text-muted">
                    {c.partnerEmail}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={pending}
                  onClick={() => run(() => respondToInvitationAction(c.id, true))}
                >
                  Terima
                </Button>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => respondToInvitationAction(c.id, false))}
                >
                  Tolak
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {waitingForMe.length > 0 ? (
        <Card className="border-amber-200 dark:border-amber-500/30">
          <CardHeader
            title={`${waitingForMe.length} dana menunggu dicocokkan`}
            description="Belum dihitung sebagai pemasukan sampai Anda kaitkan atau terima"
          />
          <div className="divide-y divide-line">
            {waitingForMe.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    Dari {partnerName(entry.collaborationId)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatDate(entry.occurredAt)}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <p className="tabular shrink-0 text-sm font-semibold">
                  <Money value={formatIDR(entry.amount)} />
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={pending}
                    onClick={() => setLinking(entry)}
                  >
                    Kaitkan
                  </Button>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => acceptCollaborationEntryAction(entry.id))}
                  >
                    Terima
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => rejectCollaborationEntryAction(entry.id))}
                  >
                    Tolak
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
            <strong className="text-foreground">Kaitkan</strong> kalau dananya
            masuk lewat transfer bank — pemasukannya sudah tercatat sendiri dari
            email, jadi cukup ditempelkan supaya tidak terhitung dua kali.{" "}
            <strong className="text-foreground">Terima</strong> hanya untuk
            pemberian tunai yang tidak menghasilkan email bank apa pun.
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Kantong kolaborasi"
          description="Akumulatif lintas periode — dana bulan lalu masih bisa terpakai bulan ini"
        />
        {collaborationSummaries.length === 0 ? (
          <EmptyState
            title="Belum ada dana kolaborasi"
            description="Tandai sebuah pengeluaran sebagai kolaborasi dari halaman detail transaksi."
          />
        ) : (
          <div className="divide-y divide-line">
            {collaborationSummaries.map((s) => (
              <div key={s.collaborationId} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      s.direction === "out"
                        ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
                        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
                    )}
                  >
                    {s.direction === "out" ? (
                      <IconArrowUpRight />
                    ) : (
                      <IconArrowDownLeft />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.partnerName}
                    </p>
                    <p className="text-[11px] text-muted">
                      {s.direction === "out"
                        ? "Anda memberi"
                        : "Anda menerima"}
                      {s.pendingCount > 0
                        ? ` · ${s.pendingCount} menunggu dicocokkan`
                        : ""}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <Stat label={s.direction === "out" ? "Diberi" : "Diterima"} value={s.total} />
                  <Stat label="Terpakai" value={s.spent} />
                  <Stat label="Sisa" value={s.remaining} strong />
                </dl>
                {s.direction === "out" ? (
                  <p className="mt-2.5 text-[11px] text-muted">
                    Anda hanya melihat angka ringkas — rincian belanjanya tidak
                    ikut terbuka. &ldquo;Terpakai&rdquo; terisi saat penerima
                    menandai pengeluarannya sendiri.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Kolaborator"
          description={`${accepted.length} aktif${outgoing.length > 0 ? ` · ${outgoing.length} undangan terkirim` : ""}`}
        />
        {accepted.length === 0 && outgoing.length === 0 && revoked.length === 0 ? (
          <EmptyState
            title="Belum ada kolaborator"
            description="Undang pengguna lain lewat emailnya untuk mulai berbagi catatan dana."
          />
        ) : (
          <div className="divide-y divide-line">
            {[...accepted, ...outgoing, ...revoked].map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted",
                    c.status === "revoked" ? "text-muted/50" : "text-muted",
                  )}
                >
                  <IconUsers />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">
                      {c.partnerName}
                    </p>
                    {c.status === "pending" ? (
                      <Badge tone="warning">Menunggu jawaban</Badge>
                    ) : null}
                    {c.status === "revoked" ? (
                      <Badge tone="neutral">Diputus</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-muted">
                    {c.status === "revoked"
                      ? "Riwayat dananya masih tersimpan"
                      : c.partnerEmail}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => setRevoking(c)}
                >
                  {c.status === "pending"
                    ? "Batalkan"
                    : c.status === "revoked"
                      ? "Hapus riwayat"
                      : "Putuskan"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {sentByMe.length > 0 ? (
        <Card>
          <CardHeader
            title="Dana yang Anda kirim"
            description="Menghapus entri tidak menghapus transaksinya — hanya keterkaitannya dengan kantong"
          />
          <div className="divide-y divide-line">
            {sentByMe.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    Ke {partnerName(entry.collaborationId)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatDate(entry.occurredAt)}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <EntryStatusBadge status={entry.status} />
                <p className="tabular shrink-0 text-sm font-semibold">
                  <Money value={formatIDR(entry.amount)} />
                </p>
                <button
                  type="button"
                  aria-label="Hapus entri"
                  disabled={pending}
                  onClick={() => setDeletingEntry(entry)}
                  className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-rose-600 disabled:pointer-events-none disabled:opacity-40"
                >
                  <IconTrash className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {inviteOpen ? (
        <InviteForm
          onClose={() => setInviteOpen(false)}
          onSubmit={(email) => run(() => inviteCollaboratorAction(email))}
        />
      ) : null}

      {linking ? (
        <LinkForm
          entry={linking}
          candidates={linkableIncome}
          onClose={() => setLinking(null)}
          onSubmit={(transactionId) =>
            run(() => linkCollaborationEntryAction(linking.id, transactionId))
          }
        />
      ) : null}

      <ConfirmDialog
        open={deletingEntry !== null}
        onClose={() => setDeletingEntry(null)}
        onConfirm={() =>
          deletingEntry &&
          run(() => deleteCollaborationEntryAction(deletingEntry.id))
        }
        title="Hapus entri dana?"
        message={
          deletingEntry ? (
            <>
              <p>
                Entri{" "}
                <strong className="text-foreground">
                  {formatIDR(deletingEntry.amount)}
                </strong>{" "}
                ke {partnerName(deletingEntry.collaborationId)} akan dihapus dari
                catatan kolaborasi.
              </p>
              {/* Akibatnya berbeda per status, dan yang paling berisiko justru
                  yang paling mudah disalahpahami — jadi disebut eksplisit. */}
              <p className="mt-2">
                {deletingEntry.status === "pending_match"
                  ? "Entri ini belum dicocokkan, jadi belum memengaruhi angka apa pun di buku penerima. Menghapusnya tidak berdampak selain menghilangkannya dari daftar tunggu."
                  : deletingEntry.status === "rejected"
                    ? "Entri ini sudah ditolak penerima, jadi tidak pernah memengaruhi angka apa pun."
                    : "Entri ini sudah dihitung di kantong. Setelah dihapus, saldo kantong berkurang sebesar nominalnya — dan bisa jadi minus kalau penerima sudah menandai belanja lebih besar dari sisanya."}
              </p>
              <p className="mt-2">
                Transaksi pengeluaran Anda dan transaksi pemasukan penerima{" "}
                <strong className="text-foreground">tetap utuh</strong> — uangnya
                memang benar-benar berpindah.
              </p>
            </>
          ) : null
        }
      />

      {revoking ? (
        <RevokeDialog
          collaboration={revoking}
          onClose={() => setRevoking(null)}
          onKeepHistory={() => run(() => revokeCollaborationAction(revoking.id))}
          onDeleteAll={() => run(() => deleteCollaborationAction(revoking.id))}
        />
      ) : null}
    </div>
  );
}

/**
 * Dua pilihan memutus, dipisah eksplisit.
 *
 * Sengaja bukan dialog konfirmasi satu tombol: keduanya berakhir pada "hubungan
 * berhenti", tapi yang satu bisa dianulir dan yang satu tidak. Menyembunyikan
 * perbedaan itu di balik satu tombol berarti menyerahkan keputusan permanen
 * pada tebakan user.
 */
function RevokeDialog({
  collaboration,
  onClose,
  onKeepHistory,
  onDeleteAll,
}: {
  collaboration: Collaboration;
  onClose: () => void;
  onKeepHistory: () => void;
  onDeleteAll: () => void;
}) {
  // Hubungan yang sudah diputus tidak perlu ditawari "putus lagi" — yang
  // tersisa hanyalah keputusan soal riwayatnya.
  const alreadyRevoked = collaboration.status === "revoked";

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        alreadyRevoked
          ? `Hapus riwayat dengan ${collaboration.partnerName}?`
          : `Putuskan kolaborasi dengan ${collaboration.partnerName}?`
      }
      description={
        alreadyRevoked
          ? "Hubungannya sudah diputus. Yang tersisa hanya riwayat dananya."
          : "Keduanya menghentikan hubungan. Bedanya pada riwayatnya."
      }
      footer={<Button onClick={onClose}>Batal</Button>}
    >
      <div className="space-y-3">
        {alreadyRevoked ? null : (
          <div className="rounded-xl border border-line p-4">
            <p className="text-sm font-medium">Putus, simpan riwayat</p>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              <li>
                • Kantong berhenti dihitung, tidak bisa lagi saling kirim dana
              </li>
              <li>
                • Riwayat dana yang pernah terjadi{" "}
                <strong className="text-foreground">tetap terbaca</strong> di
                daftar &ldquo;Dana yang Anda kirim&rdquo;
              </li>
              <li>• Bisa berkolaborasi lagi nanti lewat undangan baru</li>
            </ul>
            <Button
              variant="primary"
              className="mt-3 w-full"
              onClick={() => {
                onKeepHistory();
                onClose();
              }}
            >
              Putus, simpan riwayat
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-rose-200 p-4 dark:border-rose-500/30">
          <p className="text-sm font-medium">
            {alreadyRevoked ? "Hapus riwayat" : "Putus & hapus riwayat"}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            <li>
              • Seluruh entri dana{" "}
              <strong className="text-foreground">dihapus permanen</strong> di
              kedua sisi
            </li>
            <li>
              • Penandaan &ldquo;dibayar dari dana ini&rdquo; pada transaksi ikut
              dibersihkan
            </li>
            <li>
              • Transaksi pemasukan &amp; pengeluaran masing-masing{" "}
              <strong className="text-foreground">tetap utuh</strong> — uangnya
              memang berpindah
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-rose-700 dark:text-rose-400">
            Tidak bisa dibatalkan.
          </p>
          <Button
            variant="danger"
            className="mt-3 w-full"
            onClick={() => {
              onDeleteAll();
              onClose();
            }}
          >
            {alreadyRevoked ? "Hapus riwayat" : "Putus & hapus riwayat"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface-muted px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd
        className={cn(
          "tabular mt-0.5 text-sm",
          strong && "font-semibold",
          value < 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        <Money value={formatIDR(value)} />
      </dd>
    </div>
  );
}

function EntryStatusBadge({ status }: { status: CollaborationEntry["status"] }) {
  if (status === "pending_match")
    return <Badge tone="warning">Menunggu dicocokkan</Badge>;
  if (status === "linked") return <Badge tone="success">Dikaitkan</Badge>;
  if (status === "accepted") return <Badge tone="success">Diterima</Badge>;
  return <Badge tone="neutral">Ditolak</Badge>;
}

function InviteForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const valid = /\S+@\S+\.\S+/.test(email);

  return (
    <Modal
      open
      onClose={onClose}
      title="Undang kolaborator"
      description="Dia harus menerima undangan sebelum ada apa pun yang masuk ke bukunya."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              onSubmit(email.trim());
              onClose();
            }}
          >
            Kirim undangan
          </Button>
        </>
      }
    >
      <Field
        label="Email pengguna"
        hint="Harus sudah punya akun di aplikasi ini."
      >
        <Input
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@email.com"
        />
      </Field>
    </Modal>
  );
}

function LinkForm({
  entry,
  candidates,
  onClose,
  onSubmit,
}: {
  entry: CollaborationEntry;
  candidates: Transaction[];
  onClose: () => void;
  onSubmit: (transactionId: string) => void;
}) {
  // Yang nominalnya sama persis didahulukan — itu kandidat paling mungkin.
  const exact = candidates.filter((t) => t.amount === entry.amount);
  const others = candidates.filter((t) => t.amount !== entry.amount);
  const [selected, setSelected] = useState(exact[0]?.id ?? "");

  return (
    <Modal
      open
      onClose={onClose}
      title="Kaitkan ke transaksi masuk"
      description="Pemasukannya sudah tercatat dari email bank — cukup ditempelkan, jangan dibuat ulang."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            disabled={!selected}
            onClick={() => {
              onSubmit(selected);
              onClose();
            }}
          >
            Kaitkan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs">
          Dana masuk: <strong>{formatIDR(entry.amount)}</strong> ·{" "}
          {formatDate(entry.occurredAt)}
        </p>

        {candidates.length === 0 ? (
          <p className="text-xs text-muted">
            Belum ada transaksi masuk yang bisa dikaitkan. Kalau dananya berupa
            uang tunai, pakai tombol <strong>Terima</strong> — sistem akan
            membuatkan transaksinya.
          </p>
        ) : (
          <Field label="Pilih transaksi masuk">
            <Select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">— Pilih —</option>
              {exact.length > 0 ? (
                <optgroup label="Nominal cocok persis">
                  {exact.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatDate(t.occurredAt)} · {formatIDR(t.amount)} ·{" "}
                      {t.counterpartyName ?? "tanpa keterangan"}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {others.length > 0 ? (
                <optgroup label="Nominal berbeda">
                  {others.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatDate(t.occurredAt)} · {formatIDR(t.amount)} ·{" "}
                      {t.counterpartyName ?? "tanpa keterangan"}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
