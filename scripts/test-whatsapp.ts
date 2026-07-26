/**
 * Menguji agent WhatsApp tanpa WAHA maupun OpenRouter.
 *
 * Jalankan: `npm run test:whatsapp`
 *
 * Yang dijaga di sini adalah hal-hal yang kalau salah berakibat langsung ke
 * uang orang:
 *
 * 1. **Konfirmasi aksi destruktif** — hapus/ubah tidak pernah langsung jalan,
 *    dan "YA" yang terlambat atau untuk aksi lain tidak boleh mengeksekusi.
 * 2. **Routing nomor → user** — pesan tidak boleh menulis ke buku orang lain.
 * 3. **Tool memakai logika domain yang sama** dengan web, bukan salinannya.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = mkdtempSync(join(tmpdir(), "ft-wa-"));
process.env.DATABASE_PATH = join(testDir, "test.db");

const SUAMI = "user-suami";
const ISTRI = "user-istri";
const HP_SUAMI = "+6281111111111";
const HP_ISTRI = "+6282222222222";
const HP_ASING = "+6289999999999";

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

/** LLM tiruan: memilih tool berdasarkan isi pesan, deterministik. */
function makeFakeChat() {
  let callCount = 0;
  return async (
    messages: { role: string; content: string | null }[],
  ): Promise<{ content: string | null; tool_calls?: never[] } | never> => {
    callCount += 1;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = (lastUser?.content ?? "").toLowerCase();
    const alreadyRanTool = messages.some((m) => m.role === "tool");

    // Setelah tool dijalankan, model merangkum hasilnya.
    if (alreadyRanTool) {
      const toolOutput = [...messages].reverse().find((m) => m.role === "tool");
      return { content: toolOutput?.content ?? "Selesai." };
    }

    const call = (name: string, args: Record<string, unknown>) => ({
      content: null,
      tool_calls: [
        {
          id: `call-${callCount}`,
          type: "function" as const,
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });

    if (text.includes("kopi")) {
      return call("catat_pengeluaran_tunai", {
        nominal: 25000,
        keterangan: "beli kopi",
      }) as never;
    }
    if (text.includes("saldo")) {
      return call("saldo_dompet_tunai", {}) as never;
    }
    if (text.includes("hapus")) {
      return call("hapus_transaksi", { id: process.env.TEST_TX_ID }) as never;
    }
    if (text.includes("ringkasan")) {
      return call("ringkasan_periode", { periode: "semua" }) as never;
    }
    return { content: "Belum paham maksudnya." };
  };
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/db/connection");
  const repo = await import("../src/db/repositories");
  const { handleIncomingMessage } = await import("../src/lib/wa-agent/agent");
  const { computeCashBalance } = await import("../src/lib/domain/cash-wallet");
  const { fromChatId, toChatId } = await import("../src/lib/waha/client");

  migrate(db, { migrationsFolder: "./drizzle" });
  await repo.provisionNewUser(SUAMI);
  await repo.provisionNewUser(ISTRI);

  await repo.insertWhatsAppNumber(SUAMI, {
    phoneE164: HP_SUAMI,
    label: "Suami",
    isActive: true,
  });
  await repo.insertWhatsAppNumber(ISTRI, {
    phoneE164: HP_ISTRI,
    label: "Istri",
    isActive: true,
  });

  const chat = makeFakeChat() as never;
  const deps = { chat };

  // --- 1. Konversi chatId <-> nomor ---------------------------------------
  check("chatId dibentuk dari nomor", toChatId(HP_SUAMI) === "6281111111111@c.us");
  check("nomor dibaca kembali dari chatId", fromChatId("6281111111111@c.us") === HP_SUAMI);

  // --- 2. Routing nomor -> user -------------------------------------------
  check(
    "Nomor terdaftar mengarah ke pemiliknya",
    (await repo.findUserByWhatsAppNumber(HP_SUAMI))?.userId === SUAMI,
  );
  check(
    "Nomor asing tidak mengarah ke siapa pun",
    (await repo.findUserByWhatsAppNumber(HP_ASING)) === null,
  );

  // Nomor yang dinonaktifkan harus diperlakukan seperti tidak terdaftar.
  const istriNumber = (await repo.listWhatsAppNumbers(ISTRI))[0];
  await repo.updateWhatsAppNumber(ISTRI, istriNumber.id, { isActive: false });
  check(
    "Nomor nonaktif diperlakukan sebagai tidak terdaftar",
    (await repo.findUserByWhatsAppNumber(HP_ISTRI)) === null,
  );
  await repo.updateWhatsAppNumber(ISTRI, istriNumber.id, { isActive: true });

  // --- 3. Mencatat lewat chat ---------------------------------------------
  await handleIncomingMessage(SUAMI, HP_SUAMI, "Suami", "beli kopi 25rb", deps);

  const cashSuami = await repo.listCashEntries(SUAMI);
  check(
    "Pengeluaran tunai tercatat dari chat",
    cashSuami.length === 1 && cashSuami[0].amount === 25000,
    `${cashSuami.length} baris`,
  );
  check("Asal data ditandai WhatsApp", cashSuami[0]?.origin === "manual_wa");
  check(
    "Saldo memakai perhitungan domain yang sama dengan web",
    computeCashBalance(cashSuami) === -25000,
  );
  check(
    "Catatan istri tidak ikut terbuat",
    (await repo.listCashEntries(ISTRI)).length === 0,
  );

  // --- 4. Aksi destruktif WAJIB dikonfirmasi -------------------------------
  const txId = await repo.insertTransaction(SUAMI, {
    source: "bca",
    direction: "out",
    amount: 500_000,
    occurredAt: "2026-07-20T03:00:00.000Z",
    counterpartyName: "TOKO ABC",
    counterpartyAccountNumber: null,
    rawTransactionType: "QRIS",
    origin: "manual_web",
    gmailMessageId: null,
    rawEmailSnippet: null,
    extractionConfidence: "high",
    categoryId: null,
    isInternalTransfer: false,
    internalTransferMatchType: null,
    needsReview: false,
    reviewReason: null,
  });
  process.env.TEST_TX_ID = txId;

  const askDelete = await handleIncomingMessage(
    SUAMI,
    HP_SUAMI,
    "Suami",
    "hapus transaksi toko abc",
    deps,
  );

  check("Permintaan hapus meminta konfirmasi", askDelete.awaitingConfirmation === true);
  check(
    "Pertanyaan konfirmasi menyebut nominal & pihaknya",
    askDelete.text.includes("TOKO ABC") && askDelete.text.includes("500.000"),
    askDelete.text,
  );
  check(
    "Transaksi BELUM terhapus sebelum dikonfirmasi",
    (await repo.listTransactions(SUAMI)).some((t) => t.id === txId),
  );

  // Jawaban "tidak" harus membatalkan.
  const cancelled = await handleIncomingMessage(SUAMI, HP_SUAMI, "Suami", "tidak", deps);
  check("Balasan TIDAK membatalkan", cancelled.text.toLowerCase().includes("batal"));
  check(
    "Transaksi tetap ada setelah dibatalkan",
    (await repo.listTransactions(SUAMI)).some((t) => t.id === txId),
  );
  check(
    "Konfirmasi dibuang setelah dibatalkan",
    (await repo.getActiveConfirmation(HP_SUAMI)) === null,
  );

  // "YA" tanpa konfirmasi tertunda tidak boleh mengeksekusi apa pun.
  await handleIncomingMessage(SUAMI, HP_SUAMI, "Suami", "ya", deps);
  check(
    "YA tanpa konfirmasi tertunda tidak menghapus apa pun",
    (await repo.listTransactions(SUAMI)).some((t) => t.id === txId),
  );

  // Sekarang minta lagi lalu konfirmasi.
  await handleIncomingMessage(SUAMI, HP_SUAMI, "Suami", "hapus transaksi toko abc", deps);
  const confirmed = await handleIncomingMessage(SUAMI, HP_SUAMI, "Suami", "YA", deps);
  check("Balasan YA mengeksekusi", confirmed.text.toLowerCase().includes("dihapus"));
  check(
    "Transaksi benar-benar terhapus",
    !(await repo.listTransactions(SUAMI)).some((t) => t.id === txId),
  );

  // --- 5. Konfirmasi kedaluwarsa ------------------------------------------
  await repo.insertConfirmation({
    userId: SUAMI,
    phoneE164: HP_SUAMI,
    actionType: "delete_transaction",
    payload: { id: "apa-saja" },
    summary: "Hapus sesuatu?",
    ttlMinutes: -1, // sudah lewat
  });
  check(
    "Konfirmasi yang kedaluwarsa tidak lagi berlaku",
    (await repo.getActiveConfirmation(HP_SUAMI)) === null,
  );

  // --- 6. Satu nomor hanya boleh punya satu konfirmasi ---------------------
  await repo.insertConfirmation({
    userId: SUAMI,
    phoneE164: HP_SUAMI,
    actionType: "delete_transaction",
    payload: { id: "pertama" },
    summary: "Hapus yang pertama?",
  });
  await repo.insertConfirmation({
    userId: SUAMI,
    phoneE164: HP_SUAMI,
    actionType: "delete_transaction",
    payload: { id: "kedua" },
    summary: "Hapus yang kedua?",
  });
  const active = await repo.getActiveConfirmation(HP_SUAMI);
  check(
    "Konfirmasi baru menggantikan yang lama (YA tidak ambigu)",
    active?.payload.id === "kedua",
    JSON.stringify(active?.payload),
  );
  await repo.clearConfirmations(HP_SUAMI);

  // --- 7. Tool laporan memakai aturan produk yang sama ---------------------
  const report = await handleIncomingMessage(SUAMI, HP_SUAMI, "Suami", "ringkasan", deps);
  check(
    "Laporan menyebut transfer internal tidak dihitung",
    report.text.includes("tidak dihitung"),
    report.text,
  );

  // --- 8. Hapus akun membuang konfirmasi tertundanya -----------------------
  await repo.insertConfirmation({
    userId: SUAMI,
    phoneE164: HP_SUAMI,
    actionType: "delete_transaction",
    payload: { id: "x" },
    summary: "Hapus?",
  });
  await repo.deleteAllUserData(SUAMI);
  check(
    "Hapus akun membuang konfirmasi tertundanya",
    (await repo.getActiveConfirmation(HP_SUAMI)) === null,
  );

  // --- Laporan -------------------------------------------------------------
  console.log("\nHasil uji WhatsApp:\n");
  for (const c of checks) {
    console.log(
      `  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail && !c.ok ? ` — ${c.detail}` : ""}`,
    );
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} pemeriksaan lolos.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Uji WhatsApp gagal dijalankan:", error);
  process.exit(1);
});
