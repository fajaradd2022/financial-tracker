/**
 * Klien Gmail API minimal.
 *
 * Ditulis langsung di atas REST API alih-alih memakai `googleapis`, karena yang
 * dibutuhkan hanya tiga hal: menukar refresh token jadi access token, mencari
 * pesan, dan mengambil isi pesan. Paket `googleapis` berukuran puluhan MB untuk
 * cakupan itu.
 *
 * Scope yang dipakai cukup `gmail.readonly` — aplikasi tidak pernah perlu
 * mengirim atau menghapus apa pun dari inbox.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailError";
  }
}

/** OAuth app milik pemilik instalasi — satu untuk semua user. */
export function hasOAuthAppCredentials(): boolean {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
}

/**
 * Cache access token, **dikunci per user**.
 *
 * Sebelumnya ini satu variabel modul. Di aplikasi single-user itu benar, tapi
 * begitu multi-tenant, token user yang kebetulan menyegarkan lebih dulu akan
 * dipakai menarik inbox user berikutnya — artinya email orang lain masuk ke
 * buku yang salah. Kunci per user adalah yang mencegah itu.
 *
 * Access token Gmail berlaku ~1 jam; cache-nya supaya satu putaran polling
 * tidak menukar token berulang kali untuk tiap pesan.
 */
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

/** Dipakai pengujian & saat kredensial dicabut. */
export function clearAccessTokenCache(userId?: string) {
  if (userId) tokenCache.delete(userId);
  else tokenCache.clear();
}

export async function getAccessToken(
  userId: string,
  refreshToken: string,
): Promise<string> {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new GmailError(
      "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET belum diisi di .env.",
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GmailError(
      `Gagal menukar refresh token (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache.set(userId, {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  });
  return payload.access_token;
}

/**
 * Identitas satu koneksi Gmail. Diteruskan eksplisit ke setiap panggilan,
 * bukan diambil dari variabel global — supaya tidak mungkin ada jalur yang
 * "lupa" user mana yang sedang ditarik.
 */
export interface GmailSession {
  userId: string;
  refreshToken: string;
}

async function gmailFetch<T>(
  session: GmailSession,
  path: string,
): Promise<T> {
  const token = await getAccessToken(session.userId, session.refreshToken);
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GmailError(
      `Gmail API gagal (${response.status}) pada ${path}: ${detail.slice(0, 300)}`,
    );
  }
  return response.json() as Promise<T>;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
}

/** Mencari pesan dengan kueri Gmail (sintaks yang sama seperti kotak pencarian). */
export async function listMessages(
  session: GmailSession,
  query: string,
  maxResults = 50,
): Promise<GmailMessageSummary[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  const data = await gmailFetch<{ messages?: GmailMessageSummary[] }>(
    session,
    `/messages?${params}`,
  );
  return data.messages ?? [];
}

export interface GmailMessage {
  id: string;
  senderAddress: string;
  subject: string;
  body: string;
  internalDate: string;
}

interface RawPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: RawPart[];
}

/** Base64url -> teks. Gmail memakai varian URL-safe, bukan base64 biasa. */
function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    .toString("utf8");
}

/**
 * Mengambil isi email sebagai teks.
 *
 * Bagian text/plain lebih disukai; kalau hanya ada HTML, tag-nya dibuang secara
 * kasar. Pembersihannya tidak perlu sempurna — yang membaca berikutnya adalah
 * LLM, yang justru toleran terhadap sisa-sisa markup, dan pembersihan yang
 * terlalu agresif berisiko ikut membuang angka nominalnya.
 */
function extractBody(part: RawPart | undefined): string {
  if (!part) return "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.parts?.length) {
    const plain = part.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);

    for (const child of part.parts) {
      const nested = extractBody(child);
      if (nested) return nested;
    }
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return "";
}

export async function getMessage(
  session: GmailSession,
  id: string,
): Promise<GmailMessage> {
  const data = await gmailFetch<{
    id: string;
    internalDate: string;
    payload?: RawPart & { headers?: { name: string; value: string }[] };
  }>(session, `/messages/${id}?format=full`);

  const headers = data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    "";

  // Email di inbox khusus datang lewat forwarding, jadi header From memuat
  // pengirim aslinya (bank), bukan alamat yang meneruskan.
  const from = header("From");
  const senderAddress = from.match(/<([^>]+)>/)?.[1] ?? from;

  return {
    id: data.id,
    senderAddress: senderAddress.trim(),
    subject: header("Subject"),
    body: extractBody(data.payload),
    internalDate: data.internalDate,
  };
}
