import { headers } from "next/headers";
import { NextResponse } from "next/server";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import { clearAccessTokenCache } from "@/lib/gmail/client";

/**
 * Memutus koneksi Gmail milik user yang sedang login.
 *
 * POST, bukan GET, karena ini mengubah keadaan — dengan GET, sekadar
 * memuat gambar berisi URL ini sudah cukup untuk memutus koneksi orang.
 *
 * Ingestion ikut dimatikan: membiarkannya menyala setelah tokennya hilang cuma
 * menghasilkan putaran polling yang gagal terus setiap 12 menit.
 */
export async function POST() {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", baseUrl));

  await repo.deleteGmailCredentials(session.user.id);
  await repo.updateIngestionConfig(session.user.id, {
    enabled: false,
    inboxEmail: "",
  });
  clearAccessTokenCache(session.user.id);

  return NextResponse.redirect(
    new URL("/settings?gmail=disconnected", baseUrl),
    // 303 memaksa browser beralih ke GET saat mengikuti redirect dari POST.
    { status: 303 },
  );
}
