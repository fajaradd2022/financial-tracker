/**
 * Menyiapkan seluruh database: migrasi tabel aplikasi (Drizzle), migrasi tabel
 * Better Auth, akun admin pertama, dan data awal untuk setiap user.
 *
 * Jalankan: `npm run db:setup`
 *
 * Aman diulang — setiap langkah memeriksa dulu apakah pekerjaannya sudah ada,
 * jadi menjalankannya dua kali tidak menggandakan apa pun.
 */
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, DB_PATH, openDatabase } from "../src/db/connection";
import { provisionNewUser } from "../src/db/repositories";
import { authOptions, seedAuthOptions } from "../src/lib/auth";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "itopscitius@gmail.com";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "financial123";
const OWNER_NAME = process.env.OWNER_NAME ?? "Fajar Aditya";

async function main() {
  console.log(`Database: ${DB_PATH}\n`);

  // Koneksi sendiri, bukan singleton runtime Next.js — skrip ini proses lepas.
  const db = createDb();

  // 1. Tabel aplikasi
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ Migrasi tabel aplikasi selesai.");

  // 2. Tabel Better Auth (migrator terpisah, file database sama)
  const { runMigrations, toBeCreated, toBeAdded } = await getMigrations(
    authOptions(),
  );
  const pendingAuth = toBeCreated.length + toBeAdded.length;
  if (pendingAuth > 0) {
    await runMigrations();
    console.log(`✓ Migrasi tabel auth selesai (${pendingAuth} perubahan).`);
  } else {
    console.log("✓ Tabel auth sudah terbaru.");
  }

  // 3. Akun admin pertama
  const raw = openDatabase();
  const { count: userCount } = raw
    .prepare("SELECT COUNT(*) AS count FROM user")
    .get() as { count: number };

  if (userCount > 0) {
    console.log(`✓ Sudah ada ${userCount} pengguna — akun admin tidak dibuat ulang.`);
  } else {
    // Instance terpisah dengan pendaftaran dibuka, hanya untuk akun pertama.
    // Konfigurasi aplikasi yang berjalan tetap menolak sign-up publik.
    const seeder = betterAuth(seedAuthOptions());
    await seeder.api.signUpEmail({
      body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, name: OWNER_NAME },
    });
    raw.prepare("UPDATE user SET role = 'admin' WHERE email = ?").run(OWNER_EMAIL);
    console.log("✓ Akun admin dibuat:");
    console.log(`    email    : ${OWNER_EMAIL}`);
    console.log(`    password : ${OWNER_PASSWORD}`);
  }

  // 4. Data awal untuk SETIAP user — kategori, status sumber, konfigurasi
  //    ingestion. Dijalankan untuk semua user, bukan hanya yang baru dibuat,
  //    supaya akun yang dibuat lewat halaman admin sebelum langkah ini ada pun
  //    ikut terisi.
  const users = raw.prepare("SELECT id, email FROM user").all() as {
    id: string;
    email: string;
  }[];

  for (const user of users) {
    await provisionNewUser(user.id);
  }
  console.log(`✓ Data awal disiapkan untuk ${users.length} pengguna.`);

  raw.close();
  console.log("\nSelesai.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("✗ Gagal menyiapkan database:", error);
    process.exit(1);
  });
