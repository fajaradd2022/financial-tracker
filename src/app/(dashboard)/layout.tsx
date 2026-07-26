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

  // Seluruh data disaring ke pemilik sesi. Ini satu-satunya tempat `userId`
  // untuk jalur baca ditentukan — halaman tidak pernah memilih user sendiri.
  const userId = session.user.id;

  const [
    transactions,
    categories,
    ownAccounts,
    cashEntries,
    waNumbers,
    sourceHealth,
    ingestion,
    collaborations,
    collaborationEntries,
    collaborationSummaries,
  ] = await Promise.all([
    repo.listTransactions(userId),
    repo.listCategories(userId),
    repo.listOwnAccounts(userId),
    repo.listCashEntries(userId),
    repo.listWhatsAppNumbers(userId),
    repo.listSourceHealth(userId),
    repo.getIngestionConfig(userId),
    repo.listCollaborations(userId),
    repo.listCollaborationEntries(userId),
    repo.getCollaborationSummaries(userId),
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
        collaborations,
        collaborationEntries,
        collaborationSummaries,
        currentUserId: userId,
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
