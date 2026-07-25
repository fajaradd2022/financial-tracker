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
import { formatDateTime, SOURCE_LABEL } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { IngestionConfig, WhatsAppNumber } from "@/lib/types";

export default function SettingsPage() {
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Umum & Ingestion
        </h1>
        <p className="text-xs text-muted">
          Sumber data, kanal WhatsApp, dan data demo
        </p>
      </div>

      <Card>
        <CardHeader
          title="Ingestion email"
          description="Inbox khusus yang dipantau sistem"
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
        <div className="space-y-3 px-5 py-4">
          <div className="flex items-start gap-3 rounded-lg border border-line px-3 py-3">
            <span className="mt-0.5 text-indigo-500">
              <IconMail />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium break-all">
                {ingestion.inboxEmail}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                Email notifikasi bank di-forward otomatis ke sini dari Gmail
                utama. Aplikasi tidak pernah mengakses inbox pribadi Anda.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
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
        </div>
      </Card>

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
        <div className="border-b border-line px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-emerald-500">
              <IconWhatsApp />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">
                Bot terhubung · +62 812-0000-1111
              </p>
              <p className="text-[11px] text-muted">
                Nomor khusus bot (bukan nomor pribadi). Sesi WAHA aktif.
              </p>
            </div>
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
          yang menghapus atau mengubah data selalu minta konfirmasi{" "}
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
  const [inboxEmail, setInboxEmail] = useState(config.inboxEmail);
  const [interval, setInterval] = useState(String(config.pollIntervalMinutes));
  const [backfill, setBackfill] = useState(config.backfillEnabled);
  const [enabled, setEnabled] = useState(config.enabled);
  const [touched, setTouched] = useState(false);

  const emailValid = /\S+@\S+\.\S+/.test(inboxEmail.trim());

  return (
    <Modal
      open
      onClose={onClose}
      title="Ubah konfigurasi ingestion"
      description="Menentukan inbox mana yang dipantau dan seberapa sering."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true);
              if (!emailValid) return;
              onSubmit({
                inboxEmail: inboxEmail.trim(),
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
          label="Alamat inbox khusus"
          hint={
            touched && !emailValid
              ? "Format email tidak valid."
              : "Gunakan Gmail terpisah, bukan email pribadi Anda."
          }
        >
          <Input
            autoFocus
            type="email"
            value={inboxEmail}
            onChange={(e) => setInboxEmail(e.target.value)}
            placeholder="financetracker.ingest@gmail.com"
          />
        </Field>

        <Field
          label="Interval polling"
          hint="Makin sering makin cepat tercatat, tapi makin banyak panggilan Gmail API."
        >
          <Select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
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
