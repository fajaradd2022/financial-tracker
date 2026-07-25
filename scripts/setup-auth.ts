/**
 * Menyiapkan database autentikasi: membuat/menyesuaikan tabel Better Auth,
 * lalu membuat akun admin pertama kalau belum ada.
 *
 * Jalankan: `npm run auth:setup`
 *
 * Pendaftaran mandiri dimatikan di konfigurasi aplikasi, jadi akun pertama
 * harus lahir dari sini. Akun berikutnya dibuat lewat Pengaturan → Pengguna.
 */
// Ekstensi .ts ditulis eksplisit karena skrip ini dijalankan langsung oleh Node
// (type stripping), bukan lewat bundler Next.js.
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import {
  authOptions,
  openAuthDatabase,
  seedAuthOptions,
} from "../src/lib/auth.ts";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "itopscitius@gmail.com";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "financial123";
const OWNER_NAME = process.env.OWNER_NAME ?? "Fajar Aditya";

async function main() {
  const { runMigrations, toBeCreated, toBeAdded } = await getMigrations(
    authOptions(),
  );
  const pending = toBeCreated.length + toBeAdded.length;
  if (pending > 0) {
    await runMigrations();
    console.log(`✓ Skema auth disiapkan (${pending} perubahan tabel).`);
  } else {
    console.log("✓ Skema auth sudah terbaru.");
  }

  // Dicek langsung ke SQLite, bukan lewat auth.api.listUsers — endpoint itu
  // menuntut sesi admin yang belum mungkin ada saat seeding pertama.
  const db = openAuthDatabase();
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM user").get() as {
    count: number;
  };

  if (count > 0) {
    console.log(`✓ Sudah ada ${count} pengguna — akun admin tidak dibuat ulang.`);
    db.close();
    return;
  }

  // Instance terpisah dengan pendaftaran dibuka, hanya untuk membuat akun
  // pertama. Konfigurasi aplikasi yang berjalan tetap menolak sign-up publik.
  const seeder = betterAuth(seedAuthOptions());

  await seeder.api.signUpEmail({
    body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, name: OWNER_NAME },
  });
  db.prepare("UPDATE user SET role = 'admin' WHERE email = ?").run(OWNER_EMAIL);
  db.close();

  console.log("✓ Akun admin dibuat:");
  console.log(`  email    : ${OWNER_EMAIL}`);
  console.log(`  password : ${OWNER_PASSWORD}`);
  console.log("  Ganti password ini setelah login pertama.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("✗ Gagal menyiapkan auth:", error);
    process.exit(1);
  });
