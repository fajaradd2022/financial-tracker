import { NextResponse } from "next/server";
import { pollAllUsers } from "@/lib/ingestion/poll-gmail";

/**
 * Pemicu polling manual untuk seluruh user.
 *
 * Penjadwal utama berjalan di dalam proses (lihat `instrumentation.ts`).
 * Endpoint ini ada untuk dua hal: menguji ingestion sesuai permintaan, dan
 * sebagai jalur cadangan kalau penjadwal in-process ternyata tidak berjalan
 * (misalnya karena aplikasi dideploy dengan cara yang mematikan timer).
 *
 * Dilindungi shared secret, bukan sesi login, karena pemanggilnya adalah mesin
 * (curl/cron sistem) yang tidak punya cookie — dan karena ia menarik inbox
 * semua user, bukan milik satu orang.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;

  // Tanpa secret yang dikonfigurasi, endpoint ini ditutup sama sekali —
  // membiarkannya terbuka berarti siapa pun bisa memicu panggilan LLM berbayar.
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET belum dikonfigurasi." },
      { status: 503 },
    );
  }

  if (request.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  const results = await pollAllUsers();
  return NextResponse.json({ users: results.length, results });
}
