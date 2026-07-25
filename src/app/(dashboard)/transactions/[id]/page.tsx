import { TransactionDetailClient } from "./TransactionDetailClient";

// Next.js 16: `params` adalah Promise dan wajib di-await.
export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TransactionDetailClient id={id} />;
}
