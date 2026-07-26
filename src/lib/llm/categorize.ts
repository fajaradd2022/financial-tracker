import type {
  Category,
  CategorySystemKey,
  TransactionDirection,
} from "@/lib/types";
import { chatCompletion, type ChatMessage } from "./openrouter";
import type { CompletionFn } from "./extract";

/**
 * Pemilihan kategori otomatis.
 *
 * Dipisah dari ekstraksi (panggilan LLM tersendiri) karena dua alasan:
 * daftar kategori bisa berubah kapan saja tanpa menyentuh prompt ekstraksi,
 * dan tarik tunai bisa dikategorikan tanpa memanggil LLM sama sekali.
 *
 * Model HANYA boleh memilih dari daftar yang diberikan — tidak boleh mengarang
 * kategori baru. Kalau dibiarkan bebas, bulan ini "Makan Siang" bulan depan
 * "Kuliner", dan perbandingan antar bulan jadi tidak ada artinya.
 */

export interface CategorizationOutcome {
  categoryId: string | null;
  /** true kalau LLM tidak yakin sehingga transaksi perlu dicek manusia. */
  needsReview: boolean;
}

const SYSTEM_PROMPT = `Anda mengelompokkan transaksi keuangan pribadi ke dalam kategori yang sudah ditentukan.

Anda akan diberi daftar kategori yang tersedia beserta nomornya, lalu satu transaksi.
Balas HANYA dengan satu objek JSON: {"index": <nomor kategori>, "confident": <true|false>}

Aturan:
- index WAJIB salah satu nomor dari daftar. Jangan mengarang kategori baru.
- confident false jika Anda menebak atau informasinya terlalu sedikit.
- Jika benar-benar tidak ada yang cocok, pilih kategori "Lainnya" dan set confident false.

JSON saja, tanpa penjelasan.`;

export interface TransactionSummary {
  direction: TransactionDirection;
  amount: number;
  counterpartyName: string | null;
  rawTransactionType: string | null;
}

export async function categorizeTransaction(
  transaction: TransactionSummary,
  categories: Category[],
  completion: CompletionFn = (messages) => chatCompletion(messages),
): Promise<CategorizationOutcome> {
  const kind = transaction.direction === "in" ? "income" : "expense";
  const options = categories.filter((c) => c.kind === kind && c.isActive);

  if (options.length === 0) return { categoryId: null, needsReview: true };

  const list = options.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Kategori tersedia:
${list}

Transaksi:
- Arah      : ${transaction.direction === "in" ? "pemasukan" : "pengeluaran"}
- Nominal   : Rp${transaction.amount.toLocaleString("id-ID")}
- Pihak     : ${transaction.counterpartyName ?? "(tidak diketahui)"}
- Jenis     : ${transaction.rawTransactionType ?? "(tidak diketahui)"}`,
    },
  ];

  try {
    const raw = await completion(messages);
    const parsed = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""),
    ) as { index?: number; confident?: boolean };

    const index = Number(parsed.index);
    // Indeks di luar daftar berarti model mengarang — perlakukan sebagai gagal,
    // jangan diam-diam dipetakan ke kategori terdekat.
    if (!Number.isInteger(index) || index < 1 || index > options.length) {
      return { categoryId: null, needsReview: true };
    }

    return {
      categoryId: options[index - 1].id,
      needsReview: parsed.confident !== true,
    };
  } catch {
    return { categoryId: null, needsReview: true };
  }
}

/**
 * Mencari kategori sistem lewat kuncinya (mis. tarik tunai selalu
 * "Cash Expense", dana kolaborasi selalu "Dana Kolaborasi").
 *
 * Dicari lewat `systemKey`, bukan lewat nama, karena nama bisa berbeda antar
 * user dan aturan tetap ini tidak boleh bergantung pada teks yang bisa berubah.
 */
export function findSystemCategory(
  categories: Category[],
  key: CategorySystemKey,
): Category | undefined {
  return categories.find((c) => c.systemKey === key);
}
