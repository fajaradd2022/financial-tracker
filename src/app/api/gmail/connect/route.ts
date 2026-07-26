import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasEncryptionKey } from "@/lib/crypto";
import { hasOAuthAppCredentials } from "@/lib/gmail/client";
import { buildAuthorizationUrl, generateOAuthState } from "@/lib/gmail/oauth";

export const OAUTH_STATE_COOKIE = "gmail_oauth_state";

/**
 * Memulai alur menghubungkan Gmail.
 *
 * `state` diacak dan disimpan di cookie httpOnly, lalu dicocokkan kembali di
 * callback. Tanpa itu, orang lain bisa memancing user membuka URL callback
 * berisi kode milik penyerang, sehingga inbox penyerang yang tersambung ke akun
 * korban — dan seluruh email yang masuk ke situ akan tercatat di buku korban.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  if (!session) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  // Kedua prasyarat dicek di sini, bukan setelah user menyelesaikan consent
  // Google: percuma menyuruh orang menyetujui akses kalau tokennya toh tidak
  // bisa ditukar atau tidak bisa disimpan.
  if (!hasEncryptionKey()) {
    return NextResponse.redirect(
      new URL("/settings?gmail=no_encryption_key", baseUrl),
    );
  }
  if (!hasOAuthAppCredentials()) {
    return NextResponse.redirect(
      new URL("/settings?gmail=no_oauth_app", baseUrl),
    );
  }

  const state = generateOAuthState();
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 menit — cukup untuk consent, tidak lebih
  });

  return NextResponse.redirect(buildAuthorizationUrl(state));
}
