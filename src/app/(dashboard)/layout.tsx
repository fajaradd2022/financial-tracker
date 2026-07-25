import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import { ownerNamesFromEnv } from "@/lib/ingestion/pipeline";
import { StoreProvider } from "@/lib/store";

/**
 * Gerbang autentikasi sekaligus titik pengambilan data seluruh area terautentikasi.
 *
 * Pengecekan sesi sengaja di layout server, bukan di proxy/middleware: di sini
 * sesinya benar-benar diverifikasi ke database, sedangkan middleware hanya bisa
 * melihat cookie (pengecekan optimistis yang tidak boleh jadi satu-satunya
 * penjaga data).
 *
 * Datanya diambil sekali di sini lalu dibagikan lewat context, bukan diambil
 * ulang per halaman — jumlah barisnya kecil (skala keuangan pribadi) dan
 * dashboard memang butuh hampir semuanya sekaligus.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [
    transactions,
    categories,
    ownAccounts,
    cashEntries,
    waNumbers,
    sourceHealth,
    ingestion,
  ] = await Promise.all([
    repo.listTransactions(),
    repo.listCategories(),
    repo.listOwnAccounts(),
    repo.listCashEntries(),
    repo.listWhatsAppNumbers(),
    repo.listSourceHealth(),
    repo.getIngestionConfig(),
  ]);

  return (
    <StoreProvider
      data={{
        transactions,
        categories,
        ownAccounts,
        cashEntries,
        waNumbers,
        sourceHealth,
        ingestion,
        ownerNames: ownerNamesFromEnv(),
      }}
    >
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
