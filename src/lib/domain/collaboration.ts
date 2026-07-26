import { dayKey } from "@/lib/format";
import type { CollaborationEntry, Transaction } from "@/lib/types";

/**
 * Aturan kolaborasi.
 *
 * Fitur ini menjawab satu kebutuhan: "saya memberi uang ke istri, di saya jadi
 * pengeluaran, di dia jadi pemasukan, dan saya masih bisa tahu berapa yang
 * sudah terpakai."
 *
 * Yang membuatnya tidak sesederhana kelihatannya adalah **risiko penghitungan
 * ganda**. Kalau A transfer ke B lewat bank, bank B juga mengirim email ke
 * aplikasi B — pemasukan itu sudah tercatat sendiri. Karena itu entri
 * kolaborasi berperan sebagai penghubung ke transaksi yang sudah ada, bukan
 * sebagai transaksi tambahan.
 */

/**
 * Selisih hari yang masih dianggap "transaksi yang sama".
 *
 * Transfer antar bank di Indonesia bisa terlambat masuk sehari, dan tanggal di
 * email bank pengirim tidak selalu sama dengan bank penerima. Tiga hari cukup
 * longgar untuk itu, tapi masih cukup sempit agar dua transfer berbeda dengan
 * nominal sama tidak saling tertukar.
 */
export const MATCH_TOLERANCE_DAYS = 3;

/** Status entri yang benar-benar menambah saldo kantong. */
const COUNTED_STATUSES = new Set(["linked", "accepted"]);

/**
 * Total dana yang sudah masuk kantong.
 *
 * Entri `pending_match` sengaja TIDAK dihitung: selama belum dikaitkan atau
 * diterima, belum ada kepastian uangnya benar-benar sampai — dan menghitungnya
 * lebih awal persis akan menciptakan angka ganda yang ingin dicegah.
 */
export function computeCollaborationCredit(
  entries: CollaborationEntry[],
): number {
  return entries
    .filter((e) => COUNTED_STATUSES.has(e.status))
    .reduce((sum, e) => sum + e.amount, 0);
}

/** Total yang sudah ditandai terpakai oleh penerima. */
export function computeCollaborationSpent(
  taggedTransactions: Pick<Transaction, "amount" | "direction">[],
): number {
  return taggedTransactions
    .filter((t) => t.direction === "out")
    .reduce((sum, t) => sum + t.amount, 0);
}

function daysBetween(isoA: string, isoB: string): number {
  const a = Date.parse(`${dayKey(isoA)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(isoB)}T00:00:00Z`);
  return Math.abs(a - b) / 86_400_000;
}

/**
 * Mencari transaksi penerima yang kemungkinan adalah pemasukan dari entri ini.
 *
 * Syaratnya sengaja ketat — nominal harus sama persis, bukan sekadar mendekati.
 * Salah mengaitkan berarti dua catatan keuangan yang tidak berhubungan
 * dianggap satu, dan itu lebih sulit disadari daripada sekadar tidak menemukan
 * pasangan (yang masih bisa diselesaikan lewat tombol "terima").
 */
export function findMatchCandidates(
  entry: Pick<CollaborationEntry, "amount" | "occurredAt">,
  recipientTransactions: Transaction[],
  alreadyLinkedTransactionIds: Set<string> = new Set(),
): Transaction[] {
  return recipientTransactions
    .filter(
      (t) =>
        t.direction === "in" &&
        t.amount === entry.amount &&
        !t.isInternalTransfer &&
        !alreadyLinkedTransactionIds.has(t.id) &&
        daysBetween(t.occurredAt, entry.occurredAt) <= MATCH_TOLERANCE_DAYS,
    )
    // Yang tanggalnya paling dekat lebih mungkin jadi pasangannya.
    .sort(
      (a, b) =>
        daysBetween(a.occurredAt, entry.occurredAt) -
        daysBetween(b.occurredAt, entry.occurredAt),
    );
}
