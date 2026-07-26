import * as repo from "@/db/repositories";
import {
  chatWithTools,
  type ChatMessage,
  type ToolCall,
} from "@/lib/llm/openrouter";
import {
  executeConfirmedAction,
  executeTool,
  TOOL_DEFINITIONS,
  todayInJakarta,
  type ToolContext,
} from "./tools";

/**
 * Agent WhatsApp: satu pesan masuk -> satu balasan.
 *
 * ## Alur konfirmasi
 *
 * Pesan masuk DIPERIKSA dulu terhadap konfirmasi tertunda, sebelum menyentuh
 * LLM sama sekali. Kalau ada konfirmasi yang masih berlaku dan isinya jawaban
 * tegas, aksinya dieksekusi (atau dibatalkan) tanpa melibatkan model.
 *
 * Ini disengaja: begitu user menjawab "YA", tidak boleh ada ruang bagi model
 * untuk menafsirkan ulang maksudnya. Aksinya sudah dikunci di database sejak
 * konfirmasi diminta.
 */

const AFFIRMATIVE = new Set([
  "ya", "y", "iya", "yes", "ok", "oke", "okay", "betul", "benar", "lanjut",
]);
const NEGATIVE = new Set([
  "tidak", "gak", "nggak", "ga", "no", "batal", "cancel", "jangan",
]);

/** Batas putaran tool. Tanpa ini, model yang bingung bisa memanggil tool tanpa henti. */
const MAX_TOOL_ROUNDS = 5;

function systemPrompt(displayName: string): string {
  return `Anda asisten pencatat keuangan pribadi lewat WhatsApp. Anda sedang melayani ${displayName}.

Hari ini: ${todayInJakarta()} (zona WIB).

Aturan:
- Jawab dalam Bahasa Indonesia, singkat dan langsung — ini chat, bukan email.
- Pakai tool untuk SEMUA hal yang menyangkut data. Jangan pernah mengarang angka, saldo, atau isi transaksi dari ingatan.
- Untuk mengubah atau menghapus: panggil cari_transaksi dulu untuk mendapat id yang benar. Jangan pernah menebak id.
- Nominal dalam rupiah penuh: "25rb" = 25000, "1,5jt" = 1500000, "50k" = 50000.
- "tunai"/"cash" berarti uang fisik → catat_pengeluaran_tunai. Transfer/QRIS/gaji → catat_transaksi.
- Kalau permintaannya ambigu (nominal tidak jelas, atau ada beberapa transaksi yang cocok), TANYA dulu. Jangan menebak.
- Jangan menyebut nama tool ke user. Sampaikan hasilnya dengan bahasa manusia.
- Setelah mencatat sesuatu, sebutkan nominal dan hal apa yang dicatat supaya user bisa mengoreksi kalau salah.`;
}

export interface AgentReply {
  text: string;
  /** true kalau balasan ini meminta konfirmasi user. */
  awaitingConfirmation?: boolean;
}

export interface AgentDeps {
  /** Disuntik saat pengujian agar agent diuji tanpa memanggil OpenRouter. */
  chat?: typeof chatWithTools;
}

/**
 * Memproses satu pesan masuk.
 *
 * @param userId pemilik buku yang akan ditulis — sudah ditentukan dari nomor
 *   pengirim di lapisan webhook, tidak pernah dari isi pesan.
 */
export async function handleIncomingMessage(
  userId: string,
  phoneE164: string,
  displayName: string,
  text: string,
  deps: AgentDeps = {},
): Promise<AgentReply> {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase().replace(/[^a-z]/g, "");

  // --- 1. Konfirmasi tertunda didahulukan, sebelum LLM -----------------------
  const pending = await repo.getActiveConfirmation(phoneE164);
  if (pending) {
    if (AFFIRMATIVE.has(normalized)) {
      await repo.clearConfirmations(phoneE164);
      const result = await executeConfirmedAction(
        pending.userId,
        pending.actionType,
        pending.payload,
      );
      return { text: result };
    }
    if (NEGATIVE.has(normalized)) {
      await repo.clearConfirmations(phoneE164);
      return { text: "Dibatalkan, tidak ada yang diubah." };
    }
    // Jawaban lain: konfirmasi dibuang dan pesan diproses sebagai permintaan
    // baru. Membiarkannya menggantung berisiko "YA" untuk hal lain nanti
    // mengeksekusi aksi lama yang sudah dilupakan user.
    await repo.clearConfirmations(phoneE164);
  }

  if (!trimmed) return { text: "Pesannya kosong. Ada yang bisa saya catat?" };

  // --- 2. Jalur normal: LLM dengan tool ------------------------------------
  const chat = deps.chat ?? chatWithTools;
  const ctx: ToolContext = { userId, phoneE164 };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(displayName) },
    { role: "user", content: trimmed },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const reply = await chat(messages, TOOL_DEFINITIONS);

    const toolCalls = reply.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        text: reply.content?.trim() || "Maaf, saya belum menangkap maksudnya.",
      };
    }

    messages.push({
      role: "assistant",
      content: reply.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const outcome = await runToolCall(ctx, call);

      // Aksi destruktif berhenti di sini: konfirmasinya dicatat dan
      // pertanyaannya dikirim ke user apa adanya, tidak diserahkan ke model
      // untuk diparafrase — kalimatnya harus persis menyebut apa yang akan
      // dihapus/diubah.
      if (outcome.pending) {
        await repo.insertConfirmation({
          userId,
          phoneE164,
          actionType: outcome.pending.actionType,
          payload: outcome.pending.payload,
          summary: outcome.pending.summary,
        });
        return {
          text: `${outcome.pending.summary}\n\nBalas *YA* untuk melanjutkan, atau *TIDAK* untuk batal.`,
          awaitingConfirmation: true,
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: outcome.content,
      });
    }
  }

  return {
    text: "Maaf, permintaannya terlalu rumit untuk saya proses. Coba pecah jadi beberapa pesan.",
  };
}

async function runToolCall(ctx: ToolContext, call: ToolCall) {
  let args: Record<string, unknown> = {};
  try {
    args = call.function.arguments
      ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
      : {};
  } catch {
    // Argumen tidak valid dikembalikan sebagai hasil tool, bukan dilempar —
    // supaya model bisa memperbaiki panggilannya sendiri di putaran berikutnya.
    return { content: "Gagal: argumen tool bukan JSON yang valid." };
  }

  try {
    return await executeTool(ctx, call.function.name, args);
  } catch (error) {
    return {
      content: `Gagal menjalankan ${call.function.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
