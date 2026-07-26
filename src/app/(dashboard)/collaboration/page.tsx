import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import { CollaborationClient } from "./CollaborationClient";

/**
 * Daftar transaksi masuk yang bisa dikaitkan diambil di server, bukan lewat
 * fetch saat komponen mount — sama seperti halaman Pengguna. Datanya hanya
 * dibutuhkan penerima, jadi tidak perlu ikut dibawa ke seluruh aplikasi lewat
 * store.
 */
export default async function CollaborationPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const linkableIncome = await repo.listLinkableIncome(session.user.id);

  return <CollaborationClient linkableIncome={linkableIncome} />;
}
