import { randomBytes } from "node:crypto";
import { GmailError } from "./client";

/**
 * Alur OAuth Google untuk menghubungkan inbox khusus milik satu user.
 *
 * Client ID & Secret tetap di `.env` — satu OAuth app milik pemilik instalasi.
 * Yang lahir dari alur ini hanyalah refresh token milik user, yang lalu
 * disimpan terenkripsi.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/** Hanya baca. Aplikasi tidak pernah perlu mengirim/menghapus dari inbox. */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function redirectUri(): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/gmail/callback`;
}

export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function buildAuthorizationUrl(state: string): string {
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId) {
    throw new GmailError("GMAIL_CLIENT_ID belum diisi di .env.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    // `offline` yang membuat Google mengeluarkan refresh token sama sekali.
    access_type: "offline",
    // Tanpa ini Google hanya mengeluarkan refresh token pada persetujuan
    // PERTAMA. Kalau user pernah menghubungkan lalu menghubungkan ulang, kita
    // akan menerima respons tanpa refresh token dan koneksinya diam-diam mati.
    prompt: "consent",
    state,
  });

  return `${AUTH_URL}?${params}`;
}

export interface TokenExchangeResult {
  refreshToken: string;
  accessToken: string;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenExchangeResult> {
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
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GmailError(
      `Penukaran kode gagal (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    refresh_token?: string;
    access_token: string;
  };

  if (!payload.refresh_token) {
    throw new GmailError(
      "Google tidak mengirim refresh token. Cabut akses aplikasi ini di myaccount.google.com/permissions, lalu hubungkan ulang.",
    );
  }

  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token,
  };
}

/** Alamat inbox yang baru saja dihubungkan — untuk ditampilkan di Pengaturan. */
export async function fetchConnectedEmail(
  accessToken: string,
): Promise<string> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return "";
  const payload = (await response.json()) as { email?: string };
  return payload.email ?? "";
}
