"use client";

import { useState } from "react";
import { ConfirmDialog, Modal } from "@/components/Modal";
import {
  IconMail,
  IconPencil,
  IconPlus,
  IconTrash,
  IconWhatsApp,
} from "@/components/icons";
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
import type { GmailConnection } from "@/db/repositories";
import { formatDateTime, SOURCE_LABEL } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { IngestionConfig, WhatsAppNumber } from "@/lib/types";

/** Pesan hasil alur OAuth, dikirim lewat query `?gmail=`. */
const GMAIL_STATUS: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "Gmail berhasil dihubungkan." },
  denied: { tone: "error", text: "Anda membatalkan izin di halaman Google." },
  invalid: { tone: "error", text: "Balasan dari Google tidak lengkap." },
  state_mismatch: {
    tone: "error",
    text: "Penanda keamanan tidak cocok. Ulangi dari tombol Hubungkan Gmail — jangan membuka tautan callback secara langsung.",
  },
  failed: {
    tone: "error",
    text: "Penukaran kode gagal. Cek GMAIL_CLIENT_ID/SECRET dan redirect URI di Google Cloud Console.",
  },
  no_encryption_key: {
    tone: "error",
    text: "ENCRYPTION_KEY belum diisi di .env, jadi refresh token tidak bisa disimpan dengan aman. Buat dengan: npm run gen:key",
  },
  no_oauth_app: {
    tone: "error",
    text: "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET belum diisi di .env.",
  },
  disconnected: { tone: "ok", text: "Koneksi Gmail diputus." },
};

export function SettingsClient({
  gmailConnection,
  gmailStatus,
  oauthAppConfigured,
  encryptionKeyConfigured,
  webhookUrl,
  wahaConfigured,
  wahaWebhookSecretConfigured,
  wahaSessionStatus,
}: {
  gmailConnection: GmailConnection | null;
  gmailStatus: string | null;
  oauthAppConfigured: boolean;
  encryptionKeyConfigured: boolean;
  webhookUrl: string;
  wahaConfigured: boolean;
  wahaWebhookSecretConfigured: boolean;
  wahaSessionStatus: string | null;
}) {
  const {
    ingestion,
    updateIngestion,
    sourceHealth,
    waNumbers,
    addWaNumber,
    updateWaNumber,
    deleteWaNumber,
  } = useStore();

  const [ingestionFormOpen, setIngestionFormOpen] = useState(false);
  const [waFormOpen, setWaFormOpen] = useState(false);
  const [deletingWa, setDeletingWa] = useState<WhatsAppNumber | null>(null);

  const status = gmailStatus ? GMAIL_STATUS[gmailStatus] : null;
  const setupIncomplete = !oauthAppConfigured || !encryptionKeyConfigured;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Umum & Ingestion
        </h1>
        <p className="text-xs text-muted">
          Koneksi Gmail, sumber data, dan kanal WhatsApp
        </p>
      </div>

      {status ? (
        <p
          role="status"
          className={
            status.tone === "ok"
              ? "rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          }
        >
          {status.text}
        </p>
      ) : null}

      {/* --- Koneksi Gmail --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Koneksi Gmail"
          description="Inbox khusus yang ditarik sistem — bukan email pribadi Anda"
          action={
            gmailConnection ? (
              <Badge tone="success">Terhubung</Badge>
            ) : (
              <Badge tone="neutral">Belum terhubung</Badge>
            )
          }
        />
        <div className="space-y-3 px-5 py-4">
          {setupIncomplete ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              <p className="font-medium">Setup instalasi belum lengkap.</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {!oauthAppConfigured ? (
                  <li>
                    <code>GMAIL_CLIENT_ID</code> &amp;{" "}
                    <code>GMAIL_CLIENT_SECRET</code> belum diisi di{" "}
                    <code>.env</code>
                  </li>
                ) : null}
                {!encryptionKeyConfigured ? (
                  <li>
                    <code>ENCRYPTION_KEY</code> belum diisi — buat dengan{" "}
                    <code>npm run gen:key</code>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {gmailConnection ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-line px-3 py-3">
                <span className="mt-0.5 text-indigo-500">
                  <IconMail />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium break-all">
                    {gmailConnection.inboxEmail || "(alamat tidak terbaca)"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Dihubungkan {formatDateTime(gmailConnection.connectedAt)} ·
                    akses hanya-baca
                  </p>
                </div>
              </div>

              {gmailConnection.lastError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                  <p className="font-medium">Koneksi bermasalah</p>
                  <p className="mt-0.5">{gmailConnection.lastError}</p>
                  <p className="mt-1">
                    Hubungkan ulang untuk memperbaikinya.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <a
                  href="/api/gmail/connect"
                  className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:bg-surface-muted"
                >
                  Hubungkan ulang
                </a>
                <form action="/api/gmail/disconnect" method="post">
                  <Button size="sm" variant="danger" type="submit">
                    Putuskan
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted">
                Buat satu alamat Gmail terpisah untuk menampung forward
                notifikasi bank, lalu hubungkan di sini. Aplikasi hanya meminta
                izin <strong className="text-foreground">membaca</strong> —
                tidak bisa mengirim maupun menghapus apa pun.
              </p>
              <a
                href="/api/gmail/connect"
                aria-disabled={setupIncomplete}
                className={
                  setupIncomplete
                    ? "pointer-events-none inline-flex h-9 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white opacity-50"
                    : "inline-flex h-9 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                }
              >
                Hubungkan Gmail
              </a>
            </>
          )}
        </div>
      </Card>

      {/* --- Konfigurasi ingestion ------------------------------------------- */}
      <Card>
        <CardHeader
          title="Penarikan email"
          description="Seberapa sering inbox diperiksa"
          action={
            <div className="flex items-center gap-2">
              <Badge tone={ingestion.enabled ? "success" : "neutral"}>
                {ingestion.enabled ? "Aktif" : "Dijeda"}
              </Badge>
              <Button size="sm" onClick={() => setIngestionFormOpen(true)}>
                <IconPencil className="size-3.5" />
                Ubah
              </Button>
            </div>
          }
        />
        <dl className="grid grid-cols-2 gap-3 px-5 py-4 text-xs sm:grid-cols-3">
          <Stat
            label="Interval polling"
            value={`Tiap ${ingestion.pollIntervalMinutes} menit`}
          />
          <Stat
            label="Polling terakhir"
            value={
              ingestion.lastPolledAt
                ? formatDateTime(ingestion.lastPolledAt)
                : "Belum pernah"
            }
          />
          <Stat
            label="Backfill histori"
            value={ingestion.backfillEnabled ? "Aktif" : "Nonaktif"}
          />
        </dl>
      </Card>

      {/* --- Status sumber ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Status sumber transaksi"
          description="Sumber yang belum terverifikasi perlu dicatat manual"
        />
        <div className="divide-y divide-line">
          {sourceHealth.map((row) => (
            <div
              key={row.source}
              className="flex items-start gap-3 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium">
                    {SOURCE_LABEL[row.source]}
                  </p>
                  {row.emailSupported === true ? (
                    <Badge tone="success">Email terverifikasi</Badge>
                  ) : row.emailSupported === false ? (
                    <Badge tone="danger">Tidak kirim email</Badge>
                  ) : (
                    <Badge tone="warning">Belum diverifikasi</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{row.note}</p>
              </div>
              <p className="shrink-0 text-[11px] text-muted">
                {row.lastSeenAt
                  ? formatDateTime(row.lastSeenAt)
                  : "Belum ada email"}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* --- WhatsApp --------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="WhatsApp"
          description="Hanya nomor di daftar ini yang perintahnya diproses bot"
          action={
            <Button size="sm" onClick={() => setWaFormOpen(true)}>
              <IconPlus className="size-3.5" />
              Tambah nomor
            </Button>
          }
        />
        <div className="space-y-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className={
                wahaSessionStatus === "WORKING"
                  ? "text-emerald-500"
                  : "text-muted"
              }
            >
              <IconWhatsApp />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">
                {!wahaConfigured
                  ? "WAHA belum dikonfigurasi"
                  : wahaSessionStatus
                    ? `Sesi WAHA: ${wahaSessionStatus}`
                    : "WAHA tidak bisa dihubungi"}
              </p>
              <p className="text-[11px] text-muted">
                {!wahaConfigured
                  ? "Isi WAHA_BASE_URL dan WAHA_API_KEY di .env."
                  : wahaSessionStatus === "WORKING"
                    ? "Bot siap menerima pesan."
                    : "Cek instance WAHA — sesinya mungkin perlu scan QR ulang."}
              </p>
            </div>
          </div>

          {/* URL yang harus ditempel ke konfigurasi WAHA. Ditampilkan di sini
              supaya tidak perlu ditebak atau disusun manual. */}
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">
              URL webhook — tempelkan ke WAHA (<code>WHATSAPP_HOOK_URL</code>)
            </p>
            <CopyField value={webhookUrl} />
          </div>

          <div className="rounded-lg bg-surface-muted px-3 py-2.5 text-[11px] text-muted">
            <p className="font-medium text-foreground">
              Konfigurasi di sisi WAHA
            </p>
            <ul className="mt-1 space-y-0.5">
              <li>
                • <code>WHATSAPP_HOOK_URL</code> = URL di atas
              </li>
              <li>
                • <code>WHATSAPP_HOOK_EVENTS</code> = <code>message</code>
              </li>
              <li>
                • Custom header <code>X-Webhook-Secret</code> = nilai{" "}
                <code>WAHA_WEBHOOK_SECRET</code> di <code>.env</code> aplikasi
              </li>
            </ul>
            {!wahaWebhookSecretConfigured ? (
              <p className="mt-2 text-amber-700 dark:text-amber-400">
                <code>WAHA_WEBHOOK_SECRET</code> belum diisi — webhook menolak
                semua pesan sampai nilainya ada. Ini disengaja: endpoint yang
                terbuka bisa dipakai siapa pun menulis transaksi palsu.
              </p>
            ) : null}
          </div>
        </div>
        <div className="divide-y divide-line">
          {waNumbers.map((wa) => (
            <div
              key={wa.id}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{wa.label}</p>
                <p className="tabular mt-0.5 text-[11px] text-muted">
                  {wa.phoneE164}
                </p>
              </div>
              <Toggle
                label={`Aktifkan ${wa.label}`}
                checked={wa.isActive}
                onChange={(next) => updateWaNumber(wa.id, { isActive: next })}
              />
              <button
                type="button"
                aria-label="Hapus"
                onClick={() => setDeletingWa(wa)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-rose-600"
              >
                <IconTrash className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-3 text-[11px] text-muted">
          Pesan dari nomor di luar daftar ini diabaikan tanpa balasan. Perintah
          yang menghapus atau mengubah data akan minta konfirmasi{" "}
          <strong className="text-foreground">“Balas YA”</strong> lebih dulu.
        </div>
      </Card>

      {ingestionFormOpen ? (
        <IngestionForm
          config={ingestion}
          onClose={() => setIngestionFormOpen(false)}
          onSubmit={updateIngestion}
        />
      ) : null}

      {waFormOpen ? (
        <WaNumberForm
          onClose={() => setWaFormOpen(false)}
          onSubmit={(values) => addWaNumber({ ...values, isActive: true })}
        />
      ) : null}

      <ConfirmDialog
        open={deletingWa !== null}
        onClose={() => setDeletingWa(null)}
        onConfirm={() => deletingWa && deleteWaNumber(deletingWa.id)}
        title="Hapus nomor dari whitelist?"
        message={
          deletingWa ? (
            <>
              <strong className="text-foreground">{deletingWa.label}</strong> (
              {deletingWa.phoneE164}) tidak akan bisa lagi mengirim perintah ke
              bot.
            </>
          ) : null
        }
      />
    </div>
  );
}

/**
 * Kotak teks read-only dengan tombol salin.
 *
 * Umpan baliknya lewat state React biasa, bukan alert — menyalin URL adalah
 * aksi kecil yang tidak layak memblokir layar.
 */
function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface-muted px-3 py-2 font-mono text-[11px]"
      />
      <Button
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            // Tanpa reset, tombolnya tersangkut di "Tersalin" selamanya dan
            // salinan berikutnya tidak terlihat berhasil.
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard bisa ditolak (halaman non-HTTPS). Input di sebelahnya
            // sudah bisa diseleksi manual, jadi tidak perlu pesan error.
          }
        }}
      >
        {copied ? "Tersalin" : "Salin"}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium">{value}</dd>
    </div>
  );
}

function IngestionForm({
  config,
  onClose,
  onSubmit,
}: {
  config: IngestionConfig;
  onClose: () => void;
  onSubmit: (patch: Partial<IngestionConfig>) => void;
}) {
  const [interval, setIntervalMinutes] = useState(
    String(config.pollIntervalMinutes),
  );
  const [backfill, setBackfill] = useState(config.backfillEnabled);
  const [enabled, setEnabled] = useState(config.enabled);

  return (
    <Modal
      open
      onClose={onClose}
      title="Ubah penarikan email"
      description="Alamat inbox mengikuti akun Gmail yang dihubungkan."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            onClick={() => {
              onSubmit({
                pollIntervalMinutes: Number(interval),
                backfillEnabled: backfill,
                enabled,
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
        <Field
          label="Interval polling"
          hint="Makin sering makin cepat tercatat, tapi makin banyak panggilan Gmail API."
        >
          <Select
            value={interval}
            onChange={(e) => setIntervalMinutes(e.target.value)}
          >
            <option value="5">Tiap 5 menit</option>
            <option value="10">Tiap 10 menit</option>
            <option value="12">Tiap 12 menit</option>
            <option value="15">Tiap 15 menit</option>
            <option value="30">Tiap 30 menit</option>
            <option value="60">Tiap 1 jam</option>
          </Select>
        </Field>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-3 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">Ingestion aktif</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Matikan sementara bila sedang memperbaiki filter forwarding.
            </p>
          </div>
          <Toggle
            label="Aktifkan ingestion"
            checked={enabled}
            onChange={setEnabled}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-3 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">Backfill histori</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Menarik email lama yang sudah ada di inbox. Sekali aktif, transaksi
              lama ikut masuk — pastikan itu memang yang Anda mau.
            </p>
          </div>
          <Toggle
            label="Aktifkan backfill"
            checked={backfill}
            onChange={setBackfill}
          />
        </div>
      </div>
    </Modal>
  );
}

function WaNumberForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (values: { phoneE164: string; label: string }) => void;
}) {
  const [phone, setPhone] = useState("+62");
  const [label, setLabel] = useState("");
  const [touched, setTouched] = useState(false);

  // Format E.164 dipakai supaya cocok dengan yang dikirim webhook WAHA.
  const phoneValid = /^\+[1-9]\d{7,14}$/.test(phone.trim());
  const valid = phoneValid && label.trim() !== "";

  return (
    <Modal
      open
      onClose={onClose}
      title="Tambah nomor WhatsApp"
      description="Nomor yang boleh mengirim perintah ke bot."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true);
              if (!valid) return;
              onSubmit({ phoneE164: phone.trim(), label: label.trim() });
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
          label="Nomor WhatsApp"
          hint={
            touched && !phoneValid
              ? "Gunakan format internasional, contoh +6281234567890."
              : "Format internasional dengan kode negara."
          }
        >
          <Input
            autoFocus
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+6281234567890"
            className="tabular"
          />
        </Field>
        <Field
          label="Label"
          hint={touched && label.trim() === "" ? "Wajib diisi." : undefined}
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Istri"
          />
        </Field>
      </div>
    </Modal>
  );
}
