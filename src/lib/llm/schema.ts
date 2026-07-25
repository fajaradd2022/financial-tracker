import { z } from "zod";

/**
 * Kontrak hasil ekstraksi email transaksi.
 *
 * Skema ini dipakai dua kali: sebagai deskripsi format di dalam prompt, dan
 * sebagai validator runtime atas balasan LLM. Menjadikannya satu sumber
 * mencegah prompt dan validator perlahan berbeda.
 */
export const extractionSchema = z.object({
  /**
   * false untuk email yang bukan notifikasi transaksi (promosi, OTP, peringatan
   * login). Dipisahkan sebagai field tersendiri, bukan dibiarkan LLM
   * "mengarang" transaksi kosong, supaya email non-transaksi bisa dibuang
   * secara eksplisit alih-alih menghasilkan baris sampah.
   */
  isTransactionEmail: z.boolean(),
  direction: z.enum(["in", "out"]).nullable(),
  /** Rupiah penuh, tanpa pemisah ribuan. */
  amount: z.number().int().positive().nullable(),
  counterpartyName: z.string().nullable(),
  counterpartyAccountNumber: z.string().nullable(),
  /** ISO 8601 dengan offset +07:00. */
  occurredAt: z.string().nullable(),
  /** Label asli dari bank, mis. "TARIK TUNAI ATM". */
  rawTransactionType: z.string().nullable(),
  confidence: z.enum(["high", "low"]),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

/** Hasil untuk email yang gagal diekstrak — tetap dicatat, tidak dibuang diam-diam. */
export const FAILED_EXTRACTION: ExtractionResult = {
  isTransactionEmail: false,
  direction: null,
  amount: null,
  counterpartyName: null,
  counterpartyAccountNumber: null,
  occurredAt: null,
  rawTransactionType: null,
  confidence: "low",
};

/** Deskripsi format yang disisipkan ke prompt, diturunkan dari skema di atas. */
export const EXTRACTION_JSON_SHAPE = `{
  "isTransactionEmail": boolean,
  "direction": "in" | "out" | null,
  "amount": integer | null,
  "counterpartyName": string | null,
  "counterpartyAccountNumber": string | null,
  "occurredAt": string | null,
  "rawTransactionType": string | null,
  "confidence": "high" | "low"
}`;
