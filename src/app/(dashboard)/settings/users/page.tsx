import { headers } from "next/headers";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import {
  UsersClient,
  type InstanceStats,
  type ManagedUser,
} from "./UsersClient";

/**
 * Daftar pengguna diambil di server, bukan lewat fetch saat komponen mount.
 *
 * Selain menghilangkan kedipan "memuat…", ini menempatkan pengecekan hak akses
 * di tempat yang benar: kalau pemanggilnya bukan admin, daftarnya tidak pernah
 * sampai ke browser sama sekali.
 *
 * Yang ikut dibawa hanya angka operasional (jumlah transaksi, status ingestion,
 * aktivitas terakhir) — bukan isi transaksinya. Admin perlu tahu akun mana yang
 * ingestion-nya diam-diam mati, bukan siapa belanja apa.
 */
export default async function UsersPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const isAdmin = (session?.user as { role?: string | null })?.role === "admin";

  let users: ManagedUser[] = [];
  let instanceStats: InstanceStats | null = null;
  let error: string | null = null;

  if (!isAdmin) {
    error =
      "Akun Anda bukan admin, jadi daftar pengguna tidak bisa ditampilkan.";
  } else {
    // try/catch hanya membungkus pengambilan data. JSX-nya dirender di luar,
    // karena error saat render tidak akan tertangkap di sini — itu tugas
    // error boundary.
    try {
      const [result, stats, instance] = await Promise.all([
        auth.api.listUsers({
          query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" },
          headers: requestHeaders,
        }),
        repo.getAllUserStats(),
        repo.getInstanceStats(),
      ]);

      const statsById = new Map(stats.map((s) => [s.userId, s]));

      // Dipetakan eksplisit, bukan diteruskan apa adanya: `createdAt` berupa
      // Date yang tidak bisa melintasi batas server→client tanpa serialisasi.
      users = result.users.map((u) => {
        const s = statsById.get(u.id);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role ?? "user",
          banned: u.banned ?? false,
          createdAt: new Date(u.createdAt).toISOString(),
          transactionCount: s?.transactionCount ?? 0,
          lastActivityAt: s?.lastActivityAt ?? null,
          ingestionEnabled: s?.ingestionEnabled ?? false,
          ingestionConfigured: s?.ingestionConfigured ?? false,
          lastPolledAt: s?.lastPolledAt ?? null,
          collaborationCount: s?.collaborationCount ?? 0,
        };
      });
      instanceStats = instance;
    } catch {
      error = "Gagal memuat daftar pengguna.";
    }
  }

  return (
    <UsersClient
      users={users}
      instanceStats={instanceStats}
      error={error}
      currentUserId={session?.user.id ?? null}
    />
  );
}
