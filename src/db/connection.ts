import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

/**
 * Pembuat koneksi database — sengaja TANPA `server-only`.
 *
 * Skrip CLI (migrasi, seed, job polling) berjalan di proses Node biasa, bukan
 * di dalam React Server Component. Kalau `server-only` ikut di modul ini,
 * impornya melempar error di luar konteks itu dan semua skrip mati. Penjaga
 * `server-only` dipasang di `client.ts` yang memang khusus runtime Next.js.
 *
 * Satu file SQLite dipakai bersama tabel aplikasi (dikelola Drizzle) dan tabel
 * Better Auth (dikelola migrator Better Auth). Menyatukannya membuat backup
 * cukup menyalin satu file, dan menghindari data auth & data aplikasi jadi
 * tidak sinkron karena dipulihkan dari titik waktu berbeda.
 */

export const DB_PATH = process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH)
  : resolve(process.cwd(), "data/app.db");

export function openDatabase() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);

  // WAL: pembaca tidak saling memblokir dengan penulis. Penting di sini karena
  // job polling menulis di latar belakang sementara halaman web membaca.
  sqlite.pragma("journal_mode = WAL");
  // Tanpa ini SQLite mengabaikan foreign key sepenuhnya — termasuk ON DELETE
  // CASCADE yang diandalkan baris dompet tunai saat transaksinya dihapus.
  sqlite.pragma("foreign_keys = ON");

  return sqlite;
}

export function createDb() {
  return drizzle(openDatabase(), { schema, casing: "snake_case" });
}

export type AppDatabase = ReturnType<typeof createDb>;

/**
 * Instance bersama untuk runtime aplikasi (Next.js) maupun skrip CLI.
 *
 * Di-cache pada globalThis karena dev server Next.js memuat ulang modul setiap
 * berkas berubah; tanpa cache, tiap reload membuka koneksi SQLite baru sampai
 * kehabisan handle berkas.
 */
const globalForDb = globalThis as unknown as { __ftDb?: AppDatabase };

export const db: AppDatabase = globalForDb.__ftDb ?? createDb();

if (process.env.NODE_ENV !== "production") globalForDb.__ftDb = db;
