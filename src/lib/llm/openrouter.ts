/**
 * Klien tipis untuk OpenRouter (endpoint chat completions ala OpenAI).
 *
 * Sengaja tidak memakai SDK: yang dibutuhkan hanya satu panggilan POST, dan
 * menuliskannya sendiri membuat perilaku error & timeout-nya terlihat jelas
 * alih-alih tersembunyi di balik lapisan abstraksi.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Model dibaca dari env supaya bisa diganti tanpa mengubah kode. */
export function configuredModel(): string {
  return process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
}

export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: { model?: string; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY belum diisi. Lihat .env.example.",
    );
  }

  // Tanpa batas waktu, satu panggilan yang menggantung bisa membuat job
  // polling tidak pernah selesai dan kunci polling tidak pernah dilepas.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 60_000,
  );

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? configuredModel(),
        // Suhu rendah: tugasnya ekstraksi fakta, bukan mengarang. Keluaran yang
        // deterministik juga membuat masalah bisa direproduksi saat di-debug.
        temperature: options.temperature ?? 0,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OpenRouterError(
        `OpenRouter menolak permintaan (${response.status}): ${detail.slice(0, 300)}`,
        response.status,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new OpenRouterError("Balasan OpenRouter tidak berisi konten.");
    }
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenRouterError("Panggilan OpenRouter melewati batas waktu.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
