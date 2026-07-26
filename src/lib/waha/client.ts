/**
 * Klien WAHA (WhatsApp HTTP API).
 *
 * Dua arah komunikasi yang terpisah:
 * - **Masuk**: WAHA mengirim POST ke `/api/whatsapp/webhook` milik aplikasi.
 *   Tidak ada polling, tidak ada WebSocket — WAHA yang mendorong.
 * - **Keluar**: aplikasi memanggil REST WAHA di sini.
 *
 * Semua konfigurasi dari env karena instance WAHA adalah layanan terpisah yang
 * dipasang pemilik server, bukan sesuatu yang diatur per user.
 */

export class WahaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WahaError";
  }
}

export function wahaBaseUrl(): string {
  return (process.env.WAHA_BASE_URL ?? "").replace(/\/$/, "");
}

export function wahaSession(): string {
  return process.env.WAHA_SESSION ?? "default";
}

export function hasWahaConfig(): boolean {
  return Boolean(process.env.WAHA_BASE_URL && process.env.WAHA_API_KEY);
}

async function wahaFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const base = wahaBaseUrl();
  const apiKey = process.env.WAHA_API_KEY;

  if (!base || !apiKey) {
    throw new WahaError(
      "WAHA_BASE_URL / WAHA_API_KEY belum diisi di .env.",
    );
  }

  // Batas waktu wajib: webhook WhatsApp menunggu balasan, dan panggilan yang
  // menggantung membuat WAHA menganggapnya gagal lalu mengirim ulang pesan
  // yang sama — yang berarti transaksi bisa tercatat dua kali.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${base}${path}`, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new WahaError(
        `WAHA menolak permintaan (${response.status}) pada ${path}: ${detail.slice(0, 300)}`,
      );
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new WahaError("Panggilan ke WAHA melewati batas waktu.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Mengubah nomor E.164 jadi chatId WhatsApp.
 * WAHA memakai format `<nomor tanpa +>@c.us` untuk chat perorangan.
 */
export function toChatId(phoneE164: string): string {
  return `${phoneE164.replace(/\D/g, "")}@c.us`;
}

/** Kebalikannya — dipakai mencocokkan pengirim webhook ke whitelist. */
export function fromChatId(chatId: string): string {
  const digits = chatId.split("@")[0].replace(/\D/g, "");
  return `+${digits}`;
}

export async function sendText(
  phoneE164: string,
  text: string,
): Promise<void> {
  await wahaFetch("/api/sendText", {
    method: "POST",
    body: {
      session: wahaSession(),
      chatId: toChatId(phoneE164),
      text,
    },
  });
}

export interface WahaSessionStatus {
  name: string;
  status: string;
}

/** Status sesi — dipakai halaman Pengaturan untuk menunjukkan bot hidup atau tidak. */
export async function getSessionStatus(): Promise<WahaSessionStatus | null> {
  try {
    const data = await wahaFetch<{ name?: string; status?: string }>(
      `/api/sessions/${wahaSession()}`,
    );
    return { name: data.name ?? wahaSession(), status: data.status ?? "UNKNOWN" };
  } catch {
    // Tidak melempar: halaman Pengaturan harus tetap terbuka meski WAHA mati.
    return null;
  }
}
