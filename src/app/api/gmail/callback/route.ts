import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { clearAccessTokenCache } from "@/lib/gmail/client";
import { exchangeCodeForTokens, fetchConnectedEmail } from "@/lib/gmail/oauth";
import { OAUTH_STATE_COOKIE } from "../connect/route";
import { safeCompare } from "@/lib/crypto";

/**
 * Menerima kembalian consent Google, menukar kode jadi refresh token, lalu
 * menyimpannya terenkripsi.
 *
 * Hasilnya selalu redirect ke halaman Pengaturan dengan penanda status di query
 * — bukan JSON — karena yang membuka URL ini adalah browser user, bukan mesin.
 */
export async function GET(request: Request) {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const back = (status: string) =>
    NextResponse.redirect(new URL(`/settings?gmail=${status}`, baseUrl));

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", baseUrl));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return back("denied");
  if (!code || !state) return back("invalid");

  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  // Cookie dibuang apa pun hasilnya — satu state hanya boleh dipakai sekali.
  store.delete(OAUTH_STATE_COOKIE);

  if (!expectedState || !safeCompare(expectedState, state)) {
    return back("state_mismatch");
  }

  try {
    const { refreshToken, accessToken } = await exchangeCodeForTokens(code);
    const inboxEmail = await fetchConnectedEmail(accessToken);

    await repo.upsertGmailCredentials(
      session.user.id,
      encryptSecret(refreshToken),
      inboxEmail,
    );
    // Token lama milik user ini tidak boleh dipakai lagi setelah dia
    // menghubungkan inbox yang mungkin berbeda.
    clearAccessTokenCache(session.user.id);

    // Alamat inbox ikut disalin ke konfigurasi ingestion supaya halaman
    // Pengaturan menampilkan inbox yang benar-benar tersambung.
    await repo.updateIngestionConfig(session.user.id, { inboxEmail });

    return back("connected");
  } catch (err) {
    console.error("[gmail] gagal menghubungkan:", err);
    return back("failed");
  }
}
