/**
 * Menguji bagian Fase C yang bisa dibuktikan tanpa kredensial Google.
 *
 * Jalankan: `npm run test:gmail`
 *
 * Dua hal yang diuji, keduanya bisa gagal secara diam-diam di produksi:
 *
 * 1. **Enkripsi refresh token** — termasuk bahwa ciphertext yang diubah orang
 *    DITOLAK, bukan menghasilkan sampah yang tetap dipakai.
 * 2. **Isolasi cache access token per user** — sebelum multi-tenant, cache ini
 *    satu variabel modul. Kalau kelalaian itu kembali, token user A akan
 *    dipakai menarik inbox user B, dan email orang masuk ke buku yang salah.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = mkdtempSync(join(tmpdir(), "ft-gmail-"));
process.env.DATABASE_PATH = join(testDir, "test.db");

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/db/connection");
  const repo = await import("../src/db/repositories");
  const crypto = await import("../src/lib/crypto");

  migrate(db, { migrationsFolder: "./drizzle" });

  // --- 1. Enkripsi ---------------------------------------------------------
  process.env.ENCRYPTION_KEY = crypto.generateEncryptionKey();
  const secret = "1//0abcdefghijklmnop-refresh-token-palsu";

  const encrypted = crypto.encryptSecret(secret);
  check("Bolak-balik enkripsi menghasilkan nilai semula", crypto.decryptSecret(encrypted) === secret);
  check(
    "Ciphertext tidak memuat teks aslinya",
    !encrypted.includes(secret) && !encrypted.includes("refresh-token-palsu"),
  );
  check(
    "Dua enkripsi nilai sama menghasilkan ciphertext berbeda",
    crypto.encryptSecret(secret) !== crypto.encryptSecret(secret),
    "IV acak seharusnya membuat keduanya berbeda",
  );

  // Ciphertext diubah satu karakter — GCM harus menolaknya.
  const parts = encrypted.split(".");
  const tamperedData = Buffer.from(parts[3], "base64");
  tamperedData[0] ^= 0xff;
  const tampered = [parts[0], parts[1], parts[2], tamperedData.toString("base64")].join(".");

  let rejected = false;
  try {
    crypto.decryptSecret(tampered);
  } catch {
    rejected = true;
  }
  check("Ciphertext yang diubah DITOLAK, bukan menghasilkan sampah", rejected);

  // Kunci berbeda harus gagal, bukan menghasilkan teks lain.
  const originalKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = crypto.generateEncryptionKey();
  let wrongKeyRejected = false;
  try {
    crypto.decryptSecret(encrypted);
  } catch {
    wrongKeyRejected = true;
  }
  check("Kunci yang salah ditolak dengan jelas", wrongKeyRejected);
  process.env.ENCRYPTION_KEY = originalKey;

  // Kunci dengan panjang salah harus ditolak saat dipakai, bukan diam-diam.
  process.env.ENCRYPTION_KEY = "terlalu-pendek";
  let badKeyRejected = false;
  try {
    crypto.encryptSecret("apa saja");
  } catch {
    badKeyRejected = true;
  }
  check("Kunci berukuran salah ditolak", badKeyRejected);
  process.env.ENCRYPTION_KEY = originalKey;

  // --- 2. Penyimpanan kredensial ------------------------------------------
  await repo.upsertGmailCredentials("user-a", crypto.encryptSecret("token-A"), "a@inbox.test");
  await repo.upsertGmailCredentials("user-b", crypto.encryptSecret("token-B"), "b@inbox.test");

  const connA = await repo.getGmailConnection("user-a");
  check("Status koneksi terbaca", connA?.inboxEmail === "a@inbox.test");
  check(
    "Status koneksi TIDAK memuat token",
    !JSON.stringify(connA).includes("token") &&
      !Object.keys(connA ?? {}).some((k) => k.toLowerCase().includes("token")),
    JSON.stringify(connA),
  );

  const encA = await repo.getGmailRefreshTokenEncrypted("user-a");
  const encB = await repo.getGmailRefreshTokenEncrypted("user-b");
  check(
    "Tiap user menyimpan tokennya sendiri",
    crypto.decryptSecret(encA!) === "token-A" &&
      crypto.decryptSecret(encB!) === "token-B",
  );
  check(
    "Token tersimpan dalam keadaan terenkripsi di database",
    !encA!.includes("token-A") && encA!.startsWith("v1."),
  );

  // Menghubungkan ulang harus membersihkan error lama.
  await repo.recordGmailError("user-a", "token dicabut");
  check(
    "Error tercatat untuk ditampilkan",
    (await repo.getGmailConnection("user-a"))?.lastError === "token dicabut",
  );
  await repo.upsertGmailCredentials("user-a", crypto.encryptSecret("token-A2"), "a@inbox.test");
  check(
    "Menghubungkan ulang membersihkan error lama",
    (await repo.getGmailConnection("user-a"))?.lastError === null,
  );

  // --- 3. Isolasi cache access token --------------------------------------
  const gmail = await import("../src/lib/gmail/client");
  gmail.clearAccessTokenCache();

  // Ditukar lewat server OAuth palsu supaya tidak menyentuh jaringan.
  const originalFetch = globalThis.fetch;
  let exchangeCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) {
      exchangeCount += 1;
      return new Response(
        JSON.stringify({
          access_token: `access-untuk-panggilan-${exchangeCount}`,
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`URL tak terduga di pengujian: ${url}`);
  }) as typeof fetch;

  process.env.GMAIL_CLIENT_ID = "test-client";
  process.env.GMAIL_CLIENT_SECRET = "test-secret";

  const tokenA1 = await gmail.getAccessToken("user-a", "refresh-A");
  const tokenB1 = await gmail.getAccessToken("user-b", "refresh-B");
  const tokenA2 = await gmail.getAccessToken("user-a", "refresh-A");

  check(
    "Access token user A dan B berbeda",
    tokenA1 !== tokenB1,
    `A=${tokenA1} B=${tokenB1}`,
  );
  check(
    "Panggilan kedua user A memakai cache, bukan menukar ulang",
    tokenA2 === tokenA1 && exchangeCount === 2,
    `penukaran = ${exchangeCount}`,
  );

  gmail.clearAccessTokenCache("user-a");
  const tokenA3 = await gmail.getAccessToken("user-a", "refresh-A");
  const tokenB2 = await gmail.getAccessToken("user-b", "refresh-B");
  check(
    "Membersihkan cache satu user tidak menyentuh user lain",
    tokenA3 !== tokenA1 && tokenB2 === tokenB1,
    `A3=${tokenA3} B2=${tokenB2}`,
  );

  globalThis.fetch = originalFetch;

  // --- 4. Hapus akun ikut membuang kredensial -----------------------------
  await repo.deleteAllUserData("user-a");
  check(
    "Hapus akun membuang kredensial Gmail-nya",
    (await repo.getGmailConnection("user-a")) === null,
  );
  check(
    "Hapus akun A tidak menyentuh kredensial B",
    (await repo.getGmailConnection("user-b"))?.inboxEmail === "b@inbox.test",
  );

  // --- Laporan -------------------------------------------------------------
  console.log("\nHasil uji Gmail & enkripsi:\n");
  for (const c of checks) {
    console.log(
      `  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail && !c.ok ? ` — ${c.detail}` : ""}`,
    );
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} pemeriksaan lolos.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Uji gagal dijalankan:", error);
  process.exit(1);
});
