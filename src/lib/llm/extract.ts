import { SOURCE_LABEL } from "@/lib/format";
import type { TransactionSource } from "@/lib/types";
import { chatCompletion, type ChatMessage } from "./openrouter";
import {
  buildExtractionUserPrompt,
  buildRepairPrompt,
  EXTRACTION_SYSTEM_PROMPT,
} from "./prompt";
import {
  extractionSchema,
  FAILED_EXTRACTION,
  type ExtractionResult,
} from "./schema";

export interface EmailInput {
  source: TransactionSource;
  senderAddress: string;
  subject: string;
  body: string;
}

export interface ExtractionOutcome {
  result: ExtractionResult;
  /** Teks balasan mentah LLM — disimpan untuk audit & pemrosesan ulang. */
  raw: string | null;
  error?: string;
}

/** Bisa disuntik saat pengujian agar pipeline diuji tanpa memanggil API. */
export type CompletionFn = (messages: ChatMessage[]) => Promise<string>;

/**
 * Membuang pembungkus blok kode kalau model tetap menambahkannya meski diminta
 * mengeluarkan JSON polos. Ini kegagalan yang sering terjadi dan murah dicegah.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

function parse(text: string) {
  const json = JSON.parse(stripCodeFence(text)) as unknown;
  return extractionSchema.safeParse(json);
}

/**
 * Mengubah satu email jadi data transaksi terstruktur.
 *
 * Kegagalan TIDAK dilempar sebagai exception. Email yang gagal diekstrak tetap
 * dikembalikan sebagai hasil ber-confidence "low" berikut pesan errornya,
 * supaya pipeline bisa menyimpannya sebagai baris yang ditandai perlu direview.
 * Ini disengaja: transaksi yang hilang diam-diam jauh lebih berbahaya daripada
 * transaksi yang tercatat tapi salah — yang salah masih bisa dilihat & dikoreksi.
 */
export async function extractTransaction(
  email: EmailInput,
  completion: CompletionFn = (messages) => chatCompletion(messages),
): Promise<ExtractionOutcome> {
  const messages: ChatMessage[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildExtractionUserPrompt({
        sourceLabel: SOURCE_LABEL[email.source],
        senderAddress: email.senderAddress,
        subject: email.subject,
        body: email.body,
      }),
    },
  ];

  let raw: string | null = null;

  try {
    raw = await completion(messages);
    const first = parse(raw);
    if (first.success) return { result: first.data, raw };

    // Satu kali percobaan perbaikan: model diberi tahu kesalahannya. Lebih
    // sering berhasil daripada tidak, dan biayanya satu panggilan tambahan.
    const repairRaw = await completion([
      ...messages,
      { role: "assistant", content: raw },
      { role: "user", content: buildRepairPrompt(first.error.message) },
    ]);
    raw = repairRaw;

    const second = parse(repairRaw);
    if (second.success) return { result: second.data, raw };

    return {
      result: FAILED_EXTRACTION,
      raw,
      error: `Balasan tidak sesuai skema: ${second.error.message.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      result: FAILED_EXTRACTION,
      raw,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
