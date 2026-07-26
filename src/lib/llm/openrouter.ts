/**
 * Klien tipis untuk OpenRouter (endpoint chat completions ala OpenAI).
 *
 * Sengaja tidak memakai SDK: yang dibutuhkan hanya satu panggilan POST, dan
 * menuliskannya sendiri membuat perilaku error & timeout-nya terlihat jelas
 * alih-alih tersembunyi di balik lapisan abstraksi.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** Diisi model saat ia ingin memanggil tool. */
  tool_calls?: ToolCall[];
  /** Wajib pada pesan berperan "tool" — menunjuk panggilan yang dijawab. */
  tool_call_id?: string;
  name?: string;
}

/** Definisi tool dalam format function-calling ala OpenAI. */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionMessage {
  content: string | null;
  tool_calls?: ToolCall[];
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

/**
 * Panggilan yang bisa memakai tool.
 *
 * Dipisah dari `chatCompletion` (yang mengembalikan teks) karena pemanggilnya
 * berbeda kebutuhan: ekstraksi email hanya butuh JSON, sedangkan agent WhatsApp
 * perlu tahu tool mana yang ingin dipanggil model beserta argumennya.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  options: { model?: string; temperature?: number; timeoutMs?: number } = {},
): Promise<ChatCompletionMessage> {
  const raw = await rawCompletion(messages, {
    ...options,
    tools,
    jsonMode: false,
  });
  return {
    content: raw.content ?? null,
    tool_calls: raw.tool_calls,
  };
}

interface RawOptions {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  tools?: ToolDefinition[];
  jsonMode?: boolean;
}

/**
 * Satu tempat semua panggilan HTTP ke OpenRouter dilakukan.
 *
 * Disatukan supaya batas waktu, penanganan error, dan header hanya ditulis
 * sekali — dua pemanggil di atasnya hanya berbeda pada apa yang mereka minta
 * (JSON polos vs pemanggilan tool).
 */
async function rawCompletion(
  messages: ChatMessage[],
  options: RawOptions,
): Promise<{ content?: string; tool_calls?: ToolCall[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY belum diisi. Lihat .env.example.",
    );
  }

  // Tanpa batas waktu, satu panggilan yang menggantung bisa membuat job polling
  // tidak pernah selesai — atau, di jalur WhatsApp, membuat webhook menggantung
  // sampai WAHA menganggapnya gagal dan mengirim ulang pesan yang sama.
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
        // Suhu rendah: tugasnya mengekstrak fakta dan memilih tool, bukan
        // mengarang. Keluaran deterministik juga membuat masalah bisa
        // direproduksi saat di-debug.
        temperature: options.temperature ?? 0,
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
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
      choices?: {
        message?: { content?: string; tool_calls?: ToolCall[] };
      }[];
    };
    return payload.choices?.[0]?.message ?? {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenRouterError("Panggilan OpenRouter melewati batas waktu.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: { model?: string; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const message = await rawCompletion(messages, { ...options, jsonMode: true });
  if (!message.content) {
    throw new OpenRouterError("Balasan OpenRouter tidak berisi konten.");
  }
  return message.content;
}
