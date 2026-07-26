import Database from "better-sqlite3";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Konfigurasi Better Auth (sisi server).
 *
 * Database sementara memakai SQLite lokal supaya autentikasi sudah benar-benar
 * berfungsi sebelum backend Fase 1 ada. Saat Postgres nanti dipasang, cukup
 * ganti `database` di bawah ini — skema tabel Better Auth-nya sama.
 *
 * Login memakai email + password. Pendaftaran mandiri DIMATIKAN
 * (`disableSignUp`): akun hanya bisa dibuat admin lewat Pengaturan → Pengguna,
 * karena aplikasi ini bukan layanan publik.
 */

/**
 * Better Auth memakai file database yang sama dengan tabel aplikasi.
 * Tabelnya berbeda (user/session/account/verification vs transactions dll),
 * jadi tidak bertabrakan — dan backup cukup menyalin satu file.
 */
export const AUTH_DB_PATH = process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH)
  : resolve(process.cwd(), "data/app.db");

export function openAuthDatabase() {
  mkdirSync(dirname(AUTH_DB_PATH), { recursive: true });
  const sqlite = new Database(AUTH_DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  return sqlite;
}

// `satisfies`, bukan anotasi tipe: anotasi akan melebarkan tipe literalnya dan
// membuat endpoint dari plugin (mis. admin.listUsers) hilang dari `auth.api`.
const baseOptions = {
  database: openAuthDatabase(),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    // Fallback hanya untuk pengembangan lokal. Di VPS wajib diisi lewat .env,
    // kalau tidak semua sesi jadi invalid setiap kali nilainya berubah.
    "dev-only-secret-ganti-di-produksi-minimal-32-karakter",
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  databaseHooks: {
    user: {
      create: {
        /**
         * Menyiapkan data awal akun (kategori, status sumber, konfigurasi
         * ingestion) tepat setelah user dibuat.
         *
         * Dipasang sebagai database hook, bukan dipanggil dari halaman admin,
         * supaya SEMUA jalur pembuatan user ikut terjaring — halaman admin,
         * skrip seed, dan (nanti) pendaftaran mandiri. Tanpa ini akun baru
         * tidak punya kategori sama sekali dan halaman transaksinya tidak bisa
         * dipakai.
         */
        after: async (user) => {
          const { provisionNewUser, upsertUserDirectory } = await import(
            "@/db/repositories"
          );
          await provisionNewUser(user.id);
          await upsertUserDirectory(
            user.id,
            user.name,
            user.email.toLowerCase(),
          );
        },
      },
      update: {
        /**
         * Menjaga direktori tetap sinkron saat nama/email berubah — kalau tidak,
         * daftar kolaborator perlahan menampilkan identitas yang usang.
         */
        after: async (user) => {
          if (!user.id || !user.email || !user.name) return;
          const { upsertUserDirectory } = await import("@/db/repositories");
          await upsertUserDirectory(
            user.id,
            user.name,
            user.email.toLowerCase(),
          );
        },
      },
      delete: {
        /**
         * Membersihkan seluruh data keuangan milik user yang dihapus.
         *
         * Dikerjakan eksplisit karena tabel `user` milik Better Auth tidak
         * dideklarasikan di skema Drizzle, jadi tidak ada foreign key yang bisa
         * melakukan ON DELETE CASCADE. Tanpa ini, menghapus akun menyisakan
         * data keuangannya menggantung selamanya.
         */
        after: async (user) => {
          const { deleteAllUserData } = await import("@/db/repositories");
          await deleteAllUserData(user.id);
        },
      },
    },
  },
  plugins: [
    // Memakai peran bawaan plugin: "admin" (boleh mengelola pengguna) dan
    // "user" (hanya memakai aplikasi). Peran kustom butuh definisi access
    // control tersendiri — belum diperlukan untuk dua peran ini.
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    // nextCookies harus jadi plugin TERAKHIR — ia membungkus response untuk
    // menuliskan cookie sesi lewat API Next.js.
    nextCookies(),
  ],
} satisfies BetterAuthOptions;

export const auth = betterAuth(baseOptions);

/**
 * Opsi untuk skrip setup: pendaftaran dibuka sementara supaya akun pertama bisa
 * dibuat. Konfigurasi aplikasi yang berjalan tetap menolak sign-up publik.
 */
export function seedAuthOptions(): BetterAuthOptions {
  return {
    ...baseOptions,
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 8,
    },
  };
}

/** Opsi apa adanya — dipakai skrip migrasi skema. */
export function authOptions(): BetterAuthOptions {
  return baseOptions;
}
