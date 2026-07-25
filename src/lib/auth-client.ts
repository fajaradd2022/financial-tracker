"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

/**
 * Client Better Auth untuk komponen browser.
 *
 * `adminClient` menyediakan aksi manajemen pengguna (listUsers, createUser,
 * setRole, banUser, removeUser) yang dipakai halaman Pengaturan → Pengguna.
 * Otorisasinya tetap dicek di server: pemanggil yang bukan admin akan ditolak.
 */
export const authClient = createAuthClient({
  plugins: [adminClient()],
});

export type AppSession = typeof authClient.$Infer.Session;
