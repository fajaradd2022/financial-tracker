import { NextResponse } from "next/server";
import * as repo from "@/db/repositories";
import { safeCompare } from "@/lib/crypto";
import { hasOpenRouterKey } from "@/lib/llm/openrouter";
import { handleIncomingMessage } from "@/lib/wa-agent/agent";
import { fromChatId, hasWahaConfig, sendText } from "@/lib/waha/client";

/**
 * Penerima pesan WhatsApp dari WAHA.
 *
 * ## Tiga lapis penjagaan, semuanya perlu
 *
 * 1. **Header rahasia.** Endpoint ini terbuka ke internet. Tanpa penjagaan,
 *    siapa pun yang menemukan URL-nya bisa mengirim JSON palsu berisi "catat
 *    pengeluaran 10 juta" ke buku orang, atau memicu panggilan LLM berbayar
 *    berulang-ulang.
 *
 * 2. **Whitelist nomor.** Nomor yang tidak terdaftar diabaikan TANPA balasan.
 *    Tidak dibalas "Anda tidak berhak" — balasan semacam itu justru memberi
 *    tahu penyerang bahwa endpoint-nya hidup dan nomornya salah tebak.
 *
 * 3. **Buku milik siapa ditentukan dari nomor pengirim**, bukan dari isi pesan.
 *    Tidak ada cara bagi pengirim untuk meminta menulis ke akun orang lain.
 *
 * Selalu membalas 200 selama request-nya sah. WAHA mengirim ulang pesan yang
 * gagal, dan pengiriman ulang berarti transaksi tercatat dua kali — lebih baik
 * satu pesan gagal diproses daripada tercatat ganda.
 */

interface WahaWebhookPayload {
  event?: string;
  session?: string;
  payload?: {
    id?: string;
    from?: string;
    body?: string;
    fromMe?: boolean;
    notifyName?: string;
  };
}

export async function POST(request: Request) {
  const expected = process.env.WAHA_WEBHOOK_SECRET;

  // Tanpa rahasia terkonfigurasi, endpoint ditutup sama sekali. Membiarkannya
  // terbuka "sementara" adalah cara paling umum lubang seperti ini menetap.
  if (!expected) {
    return NextResponse.json(
      { error: "WAHA_WEBHOOK_SECRET belum dikonfigurasi." },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!safeCompare(provided, expected)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  let body: WahaWebhookPayload;
  try {
    body = (await request.json()) as WahaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });
  }

  // WAHA mengirim banyak jenis event (status pesan, presence, dll).
  // Yang diproses hanya pesan masuk.
  if (body.event && body.event !== "message") {
    return NextResponse.json({ ok: true, ignored: body.event });
  }

  const message = body.payload;
  // Pesan dari bot sendiri harus diabaikan, kalau tidak balasannya sendiri
  // akan memicu putaran tak berujung.
  if (!message?.from || message.fromMe) {
    return NextResponse.json({ ok: true, ignored: "bukan pesan masuk" });
  }

  const phone = fromChatId(message.from);
  const owner = await repo.findUserByWhatsAppNumber(phone);

  if (!owner) {
    // Diam sepenuhnya. Tidak ada balasan, tidak ada petunjuk apa pun.
    console.warn(`[whatsapp] pesan dari nomor tak terdaftar diabaikan: ${phone}`);
    return NextResponse.json({ ok: true, ignored: "nomor tidak terdaftar" });
  }

  const text = (message.body ?? "").trim();
  if (!text) return NextResponse.json({ ok: true, ignored: "pesan kosong" });

  try {
    if (!hasOpenRouterKey()) {
      await reply(phone, "Bot belum aktif: OPENROUTER_API_KEY belum diisi.");
      return NextResponse.json({ ok: true });
    }

    const result = await handleIncomingMessage(
      owner.userId,
      phone,
      message.notifyName || owner.label,
      text,
    );
    await reply(phone, result.text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[whatsapp] gagal memproses pesan:", error);
    // Tetap 200: kalau webhook dianggap gagal, WAHA mengirim ulang pesan yang
    // sama dan transaksinya bisa tercatat dua kali.
    await reply(
      phone,
      "Maaf, ada kendala di sistem. Coba lagi sebentar lagi.",
    ).catch(() => {});
    return NextResponse.json({ ok: true, error: "diproses dengan kesalahan" });
  }
}

async function reply(phone: string, text: string) {
  if (!hasWahaConfig()) {
    console.warn("[whatsapp] WAHA belum dikonfigurasi, balasan tidak dikirim.");
    return;
  }
  await sendText(phone, text);
}
