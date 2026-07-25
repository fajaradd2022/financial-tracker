import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { auth } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";

/**
 * Gerbang autentikasi seluruh area terautentikasi.
 *
 * Pengecekan sesi sengaja di layout server, bukan di proxy/middleware: di sini
 * sesinya benar-benar diverifikasi ke database, sedangkan middleware hanya bisa
 * melihat cookie (pengecekan optimistis yang tidak boleh jadi satu-satunya
 * penjaga data).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/login");

  return (
    <StoreProvider>
      <AppShell
        user={{
          name: session.user.name,
          email: session.user.email,
          role: (session.user as { role?: string | null }).role ?? "user",
        }}
      >
        {children}
      </AppShell>
    </StoreProvider>
  );
}
