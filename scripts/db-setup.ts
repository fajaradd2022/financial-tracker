/**
 * Menyiapkan seluruh database: migrasi tabel aplikasi (Drizzle), migrasi tabel
 * Better Auth, seed data awal, dan akun admin pertama.
 *
 * Jalankan: `npm run db:setup`
 *
 * Aman diulang — setiap langkah memeriksa dulu apakah pekerjaannya sudah ada,
 * jadi menjalankannya dua kali tidak menggandakan apa pun.
 */
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import { createDb, DB_PATH, openDatabase } from "../src/db/connection";
import {
  categories,
  ingestionConfig,
  sourceHealth,
} from "../src/db/schema";
import {
  SEED_CATEGORIES,
  SEED_INGESTION_CONFIG,
  SEED_SOURCE_HEALTH,
} from "../src/db/seed-data";
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

  // 3. Kategori — dilewati kalau sudah ada, agar perubahan user tidak tertimpa
  const [{ count: categoryCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(categories);

  if (categoryCount === 0) {
    await db.insert(categories).values(
      SEED_CATEGORIES.map((c) => ({
        name: c.name,
        kind: c.kind,
        sortOrder: c.sortOrder,
        isSystem: "isSystem" in c ? c.isSystem : false,
      })),
    );
    console.log(`✓ ${SEED_CATEGORIES.length} kategori awal dibuat.`);
  } else {
    console.log(`✓ Kategori sudah ada (${categoryCount}) — dilewati.`);
  }

  // 4. Status sumber
  const [{ count: healthCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sourceHealth);

  if (healthCount === 0) {
    await db.insert(sourceHealth).values(
      SEED_SOURCE_HEALTH.map((s) => ({
        source: s.source,
        emailSupported: s.emailSupported,
        note: s.note,
      })),
    );
    console.log("✓ Status sumber transaksi disiapkan.");
  } else {
    console.log("✓ Status sumber sudah ada — dilewati.");
  }

  // 5. Konfigurasi ingestion (baris tunggal)
  const [{ count: configCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ingestionConfig);

  if (configCount === 0) {
    await db.insert(ingestionConfig).values({
      id: "singleton",
      ...SEED_INGESTION_CONFIG,
    });
    console.log("✓ Konfigurasi ingestion dibuat (masih dimatikan).");
  } else {
    console.log("✓ Konfigurasi ingestion sudah ada — dilewati.");
  }

  // 6. Akun admin pertama
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
  raw.close();

  console.log("\nSelesai.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("✗ Gagal menyiapkan database:", error);
    process.exit(1);
  });
