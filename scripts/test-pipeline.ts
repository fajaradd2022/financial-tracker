/**
 * Menguji pipeline ingestion end-to-end memakai email contoh dan LLM tiruan.
 *
 * Jalankan: `npm run test:pipeline`
 *
 * Tujuannya membuktikan logika yang paling menentukan benar-tidaknya angka —
 * deteksi transfer internal, dompet tunai, kategorisasi, penandaan review —
 * tanpa perlu kredensial Gmail maupun OpenRouter. Yang ditiru hanya balasan
 * LLM; sisanya (pemetaan sumber, pencocokan rekening, penulisan ke database,
 * idempotensi) berjalan sungguhan.
 *
 * Memakai file database terpisah agar tidak menyentuh data asli.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Harus diset SEBELUM modul database di-import; karena itu seluruh import
// database di bawah memakai dynamic import, bukan import statis di atas.
const testDir = mkdtempSync(join(tmpdir(), "ft-test-"));
process.env.DATABASE_PATH = join(testDir, "test.db");
process.env.OWNER_ACCOUNT_NAMES = "FAJAR ADITYA,ANNISA PUTRI";

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

/**
 * LLM tiruan: membalas berdasarkan isi prompt.
 * Ini membuat pengujian deterministik dan gratis, sekaligus memastikan pipeline
 * memang memanggil ekstraksi dan kategorisasi pada tahap yang benar.
 */
function fakeCompletion(messages: { role: string; content: string }[]) {
  const prompt = messages[messages.length - 1].content;

  // Panggilan kategorisasi
  if (prompt.includes("Kategori tersedia:")) {
    if (prompt.includes("KOPI KENANGAN")) {
      const index = prompt
        .split("\n")
        .find((l) => l.includes("Makanan & Minuman"))
        ?.split(".")[0];
      return Promise.resolve(
        JSON.stringify({ index: Number(index), confident: true }),
      );
    }
    const index = prompt
      .split("\n")
      .find((l) => l.includes("Lainnya"))
      ?.split(".")[0];
    return Promise.resolve(
      JSON.stringify({ index: Number(index), confident: false }),
    );
  }

  // Panggilan ekstraksi
  if (prompt.includes("ANNISA PUTRI") && prompt.includes("0987654321")) {
    return Promise.resolve(
      JSON.stringify({
        isTransactionEmail: true,
        direction: "out",
        amount: 5_000_000,
        counterpartyName: "ANNISA PUTRI",
        counterpartyAccountNumber: "0987654321",
        occurredAt: "2026-07-25T10:20:00+07:00",
        rawTransactionType: "TRANSFER KELUAR",
        confidence: "high",
      }),
    );
  }
  if (prompt.includes("TARIK TUNAI")) {
    return Promise.resolve(
      JSON.stringify({
        isTransactionEmail: true,
        direction: "out",
        amount: 1_500_000,
        counterpartyName: "ATM BCA KELAPA GADING",
        counterpartyAccountNumber: null,
        occurredAt: "2026-07-24T17:12:00+07:00",
        rawTransactionType: "TARIK TUNAI ATM",
        confidence: "high",
      }),
    );
  }
  if (prompt.includes("KOPI KENANGAN")) {
    return Promise.resolve(
      JSON.stringify({
        isTransactionEmail: true,
        direction: "out",
        amount: 32_000,
        counterpartyName: "KOPI KENANGAN GADING",
        counterpartyAccountNumber: null,
        occurredAt: "2026-07-26T08:22:00+07:00",
        rawTransactionType: "QRIS DEBIT",
        confidence: "high",
      }),
    );
  }
  if (prompt.includes("ANNISA P*****")) {
    return Promise.resolve(
      JSON.stringify({
        isTransactionEmail: true,
        direction: "out",
        amount: 1_200_000,
        counterpartyName: "ANNISA P*****",
        counterpartyAccountNumber: null,
        occurredAt: "2026-07-08T13:47:00+07:00",
        rawTransactionType: "TRANSFER KELUAR",
        confidence: "high",
      }),
    );
  }
  // Email promosi
  return Promise.resolve(
    JSON.stringify({
      isTransactionEmail: false,
      direction: null,
      amount: null,
      counterpartyName: null,
      counterpartyAccountNumber: null,
      occurredAt: null,
      rawTransactionType: null,
      confidence: "low",
    }),
  );
}

function email(id: string, sender: string, subject: string, body: string) {
  return {
    id,
    senderAddress: sender,
    subject,
    body,
    internalDate: String(Date.parse("2026-07-26T00:00:00Z")),
  };
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/db/connection");
  const repo = await import("../src/db/repositories");
  const { ingestMessage } = await import("../src/lib/ingestion/pipeline");
  const { SEED_CATEGORIES } = await import("../src/db/seed-data");
  const { categories } = await import("../src/db/schema");

  migrate(db, { migrationsFolder: "./drizzle" });

  await db.insert(categories).values(
    SEED_CATEGORIES.map((c) => ({
      name: c.name,
      kind: c.kind,
      sortOrder: c.sortOrder,
      isSystem: "isSystem" in c ? c.isSystem : false,
    })),
  );

  // Rekening istri didaftarkan — inilah yang harus membuat transfer ke sana
  // dikenali sebagai transfer internal.
  await repo.insertOwnAccount({
    owner: "wife",
    bank: "bca",
    accountNumberOrIdentifier: "0987654321",
    label: "BCA Istri",
    isActive: true,
  });

  const deps = { completion: fakeCompletion };

  // --- 1. Transfer ke rekening sendiri (cocok nomor rekening) ---------------
  const transferMsg = email(
    "msg-transfer",
    "notifikasi@bca.co.id",
    "Notifikasi Transaksi",
    "Transfer ke 0987654321 a.n ANNISA PUTRI sebesar Rp5.000.000,00 berhasil.",
  );
  const transfer = await ingestMessage(transferMsg, deps);
  const transferRow = (await repo.listTransactions()).find(
    (t) => t.gmailMessageId === "msg-transfer",
  );

  check("Transfer internal tersimpan", transfer.status === "inserted");
  check(
    "Transfer ke rekening sendiri ditandai internal",
    transferRow?.isInternalTransfer === true,
  );
  check(
    "Cocok lewat nomor rekening (bukan nama)",
    transferRow?.internalTransferMatchType === "account_number",
  );
  check(
    "Cocok nomor rekening tidak perlu direview",
    transferRow?.needsReview === false,
  );

  // --- 2. Idempotensi -------------------------------------------------------
  const again = await ingestMessage(transferMsg, deps);
  check(
    "Email yang sama tidak tersimpan dua kali",
    again.status === "skipped_duplicate",
  );

  // --- 3. Tarik tunai -------------------------------------------------------
  await ingestMessage(
    email(
      "msg-atm",
      "notifikasi@bca.co.id",
      "Notifikasi Transaksi",
      "TARIK TUNAI ATM Rp1.500.000,00 di ATM BCA KELAPA GADING.",
    ),
    deps,
  );
  const atmRow = (await repo.listTransactions()).find(
    (t) => t.gmailMessageId === "msg-atm",
  );
  const allCategories = await repo.listCategories();
  const cashCategory = allCategories.find((c) => c.isSystem);
  const cashEntries = await repo.listCashEntries();

  check(
    "Tarik tunai berkategori Cash Expense otomatis",
    atmRow?.categoryId === cashCategory?.id,
  );
  check(
    "Tarik tunai menambah saldo dompet tunai",
    cashEntries.some(
      (e) =>
        e.transactionId === atmRow?.id &&
        e.entryType === "withdrawal_credit" &&
        e.amount === 1_500_000,
    ),
  );

  // --- 4. Pengeluaran biasa + kategorisasi ---------------------------------
  await ingestMessage(
    email(
      "msg-qris",
      "notifikasi@bca.co.id",
      "Notifikasi Transaksi",
      "Pembayaran QRIS ke KOPI KENANGAN GADING Rp32.000,00.",
    ),
    deps,
  );
  const qrisRow = (await repo.listTransactions()).find(
    (t) => t.gmailMessageId === "msg-qris",
  );
  const foodCategory = allCategories.find(
    (c) => c.name === "Makanan & Minuman",
  );

  check("Pengeluaran biasa tidak ditandai internal", qrisRow?.isInternalTransfer === false);
  check("Kategori dipilih LLM dari daftar", qrisRow?.categoryId === foodCategory?.id);
  check("Kategorisasi yakin tidak perlu direview", qrisRow?.needsReview === false);

  // --- 5. Nama disamarkan -> cocok lewat nama, wajib direview ---------------
  await ingestMessage(
    email(
      "msg-masked",
      "noreply@seabank.co.id",
      "Notifikasi Transaksi",
      "Transfer sebesar Rp1.200.000 ke ANNISA P***** berhasil diproses.",
    ),
    deps,
  );
  const maskedRow = (await repo.listTransactions()).find(
    (t) => t.gmailMessageId === "msg-masked",
  );

  check("Nama disamarkan tetap dikenali internal", maskedRow?.isInternalTransfer === true);
  check(
    "Cocok nama ditandai sebagai fuzzy_name",
    maskedRow?.internalTransferMatchType === "fuzzy_name",
  );
  check("Cocok nama wajib direview", maskedRow?.needsReview === true);
  check(
    "Alasan review-nya tepat",
    maskedRow?.reviewReason === "fuzzy_internal_match",
  );

  // --- 6. Email non-transaksi ----------------------------------------------
  const promo = await ingestMessage(
    email(
      "msg-promo",
      "promo@bca.co.id",
      "Promo Kartu Kredit Juli!",
      "Dapatkan cashback hingga 50% untuk transaksi di merchant pilihan.",
    ),
    deps,
  );
  check(
    "Email promosi tidak jadi transaksi",
    promo.status === "skipped_not_transaction",
  );

  // --- 7. Sumber dikenali dari alamat pengirim ------------------------------
  check("Sumber BCA dikenali dari pengirim", qrisRow?.source === "bca");
  check("Sumber SeaBank dikenali dari pengirim", maskedRow?.source === "seabank");

  // --- 8. Aturan produk: internal tidak masuk hitungan ----------------------
  const { summarizePeriod } = await import("../src/lib/store");
  const { allPeriod } = await import("../src/lib/period");
  const summary = summarizePeriod(await repo.listTransactions(), allPeriod());

  check(
    "Transfer internal tidak dihitung sebagai pengeluaran",
    summary.expense === 1_500_000 + 32_000,
    `pengeluaran = ${summary.expense}, seharusnya ${1_500_000 + 32_000}`,
  );
  check(
    "Transfer internal dilaporkan terpisah",
    summary.internalTransferTotal === 5_000_000 + 1_200_000,
    `internal = ${summary.internalTransferTotal}`,
  );

  // --- Laporan --------------------------------------------------------------
  console.log("\nHasil uji pipeline:\n");
  for (const c of checks) {
    console.log(
      `  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail && !c.ok ? ` — ${c.detail}` : ""}`,
    );
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(
    `\n${checks.length - failed}/${checks.length} pemeriksaan lolos.`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Uji pipeline gagal dijalankan:", error);
  process.exit(1);
});
