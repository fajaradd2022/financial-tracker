import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import { hasEncryptionKey } from "@/lib/crypto";
import { hasOAuthAppCredentials } from "@/lib/gmail/client";
import { getSessionStatus, hasWahaConfig } from "@/lib/waha/client";
import { SettingsClient } from "./SettingsClient";

/**
 * Status koneksi Gmail diambil di server.
 *
 * Yang diambil sengaja hanya `getGmailConnection()` — alamat inbox dan waktu
 * koneksi — bukan `getGmailRefreshTokenEncrypted()`. Token itu hanya dibutuhkan
 * job polling; kalau ikut diambil di sini, rahasianya akan ikut menyeberang ke
 * payload RSC hanya demi menampilkan sebuah label.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [connection, params, wahaSession] = await Promise.all([
    repo.getGmailConnection(session.user.id),
    searchParams,
    // Mengembalikan null kalau WAHA mati — halaman harus tetap terbuka.
    hasWahaConfig() ? getSessionStatus() : Promise.resolve(null),
  ]);

  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return (
    <SettingsClient
      gmailConnection={connection}
      gmailStatus={params.gmail ?? null}
      oauthAppConfigured={hasOAuthAppCredentials()}
      encryptionKeyConfigured={hasEncryptionKey()}
      webhookUrl={`${baseUrl.replace(/\/$/, "")}/api/whatsapp/webhook`}
      wahaConfigured={hasWahaConfig()}
      wahaWebhookSecretConfigured={Boolean(process.env.WAHA_WEBHOOK_SECRET)}
      wahaSessionStatus={wahaSession?.status ?? null}
    />
  );
}
