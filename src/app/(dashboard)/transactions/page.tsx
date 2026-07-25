import { Suspense } from "react";
import { Card } from "@/components/ui";
import { TransactionsClient } from "./TransactionsClient";

// useSearchParams() butuh Suspense boundary supaya bagian halaman lain tetap
// bisa dirender lebih dulu saat prerender.
export default function TransactionsPage() {
  return (
    <Suspense fallback={<Card className="h-64 animate-pulse"><span className="sr-only">Memuat transaksi…</span></Card>}>
      <TransactionsClient />
    </Suspense>
  );
}
