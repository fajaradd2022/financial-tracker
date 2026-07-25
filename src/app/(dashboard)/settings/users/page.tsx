import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { UsersClient, type ManagedUser } from "./UsersClient";

/**
 * Daftar pengguna diambil di server, bukan lewat fetch saat komponen mount.
 *
 * Selain menghilangkan kedipan "memuat…", ini menempatkan pengecekan hak akses
 * di tempat yang benar: kalau pemanggilnya bukan admin, Better Auth menolak di
 * sini dan daftarnya tidak pernah sampai ke browser sama sekali.
 */
export default async function UsersPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const isAdmin = (session?.user as { role?: string | null })?.role === "admin";

  let users: ManagedUser[] = [];
  let error: string | null = null;

  if (!isAdmin) {
    error =
      "Akun Anda bukan admin, jadi daftar pengguna tidak bisa ditampilkan.";
  } else {
    try {
      const result = await auth.api.listUsers({
        query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" },
        headers: requestHeaders,
      });
      // Dipetakan eksplisit, bukan diteruskan apa adanya: `createdAt` berupa
      // Date yang tidak bisa melintasi batas server→client tanpa serialisasi.
      users = result.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role ?? "user",
        banned: u.banned ?? false,
        createdAt: new Date(u.createdAt).toISOString(),
      }));
    } catch {
      error = "Gagal memuat daftar pengguna.";
    }
  }

  return (
    <UsersClient
      users={users}
      error={error}
      currentUserId={session?.user.id ?? null}
    />
  );
}
