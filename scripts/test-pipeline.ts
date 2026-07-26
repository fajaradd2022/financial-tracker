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

const USER = "user-uji";
const OWNER_NAMES = ["FAJAR ADITYA"];

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
function fakeCompletion(messages: { role: string; content: string | null }[]) {
  const prompt = messages[messages.length - 1].content ?? "";

  // Panggilan kategorisasi
  if (prompt.includes("Kategori tersedia:")) {
    const pick = (label: string) => {
      const index = prompt
        .split("\n")
        .find((l) => l.includes(label))
        ?.split(".")[0];
      return JSON.stringify({ index: Number(index), confident: true });
    };
    if (prompt.includes("KOPI KENANGAN")) return Promise.resolve(pick("Makanan & Minuman"));
    if (prompt.includes("ANNISA PUTRI")) return Promise.resolve(pick("Kolaborasi Keluar"));
    const index = prompt
      .split("\n")
      .find((l) => l.includes("Lainnya"))
      ?.split(".")[0];
    return Promise.resolve(
      JSON.stringify({ index: Number(index), confident: false }),
    );
  }

  // Panggilan ekstraksi
  if (prompt.includes("0987654321")) {
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
  if (prompt.includes("901234567890")) {
    return Promise.resolve(
      JSON.stringify({
        isTransactionEmail: true,
        direction: "out",
        amount: 3_000_000,
        counterpartyName: "FAJAR ADITYA",
        counterpartyAccountNumber: "901234567890",
        occurredAt: "2026-07-14T16:41:00+07:00",
        rawTransactionType: "TRANSFER KELUAR - SEABANK",
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
  if (prompt.includes("FAJAR A*****")) {
    return Promise.resolve(
      JSON.stringify({
        isTransactionEmail: true,
        direction: "out",
        amount: 1_200_000,
        counterpartyName: "FAJAR A*****",
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

  migrate(db, { migrationsFolder: "./drizzle" });
  await repo.provisionNewUser(USER);

  // HANYA rekening milik user ini. Rekening pasangan TIDAK didaftarkan di sini
  // — sejak aplikasi multi-tenant, pasangan adalah tenant terpisah.
  await repo.insertOwnAccount(USER, {
    bank: "seabank",
    accountNumberOrIdentifier: "901234567890",
    label: "SeaBank Saya",
    isActive: true,
  });

  const deps = { completion: fakeCompletion, ownerNames: OWNER_NAMES };
  const find = async (msgId: string) =>
    (await repo.listTransactions(USER)).find((t) => t.gmailMessageId === msgId);

  // --- 1. Transfer ke rekening SENDIRI (masih internal) --------------------
  await ingestMessage(
    USER,
    email(
      "msg-own",
      "notifikasi@bca.co.id",
      "Notifikasi Transaksi",
      "Transfer ke 901234567890 a.n FAJAR ADITYA sebesar Rp3.000.000,00 berhasil.",
    ),
    deps,
  );
  const ownRow = await find("msg-own");

  check("Transfer antar rekening sendiri tetap internal", ownRow?.isInternalTransfer === true);
  check(
    "Cocok lewat nomor rekening (bukan nama)",
    ownRow?.internalTransferMatchType === "account_number",
  );
  check("Cocok nomor rekening tidak perlu direview", ownRow?.needsReview === false);

  // --- 2. Transfer ke rekening PASANGAN (kini pengeluaran) -----------------
  const spouseMsg = email(
    "msg-spouse",
    "notifikasi@bca.co.id",
    "Notifikasi Transaksi",
    "Transfer ke 0987654321 a.n ANNISA PUTRI sebesar Rp5.000.000,00 berhasil.",
  );
  await ingestMessage(USER, spouseMsg, deps);
  const spouseRow = await find("msg-spouse");

  check(
    "Transfer ke rekening pasangan BUKAN internal lagi",
    spouseRow?.isInternalTransfer === false,
  );
  check("Transfer ke pasangan tercatat sebagai pengeluaran", spouseRow?.direction === "out");

  // --- 3. Idempotensi -------------------------------------------------------
  const again = await ingestMessage(USER, spouseMsg, deps);
  check("Email yang sama tidak tersimpan dua kali", again.status === "skipped_duplicate");

  // --- 4. Tarik tunai -------------------------------------------------------
  await ingestMessage(
    USER,
    email(
      "msg-atm",
      "notifikasi@bca.co.id",
      "Notifikasi Transaksi",
      "TARIK TUNAI ATM Rp1.500.000,00 di ATM BCA KELAPA GADING.",
    ),
    deps,
  );
  const atmRow = await find("msg-atm");
  const allCategories = await repo.listCategories(USER);
  const cashCategory = allCategories.find((c) => c.systemKey === "cash_expense");
  const cashEntries = await repo.listCashEntries(USER);

  check("Tarik tunai berkategori Cash Expense otomatis", atmRow?.categoryId === cashCategory?.id);
  check(
    "Tarik tunai menambah saldo dompet tunai",
    cashEntries.some(
      (e) =>
        e.transactionId === atmRow?.id &&
        e.entryType === "withdrawal_credit" &&
        e.amount === 1_500_000,
    ),
  );

  // --- 5. Pengeluaran biasa + kategorisasi ---------------------------------
  await ingestMessage(
    USER,
    email(
      "msg-qris",
      "notifikasi@bca.co.id",
      "Notifikasi Transaksi",
      "Pembayaran QRIS ke KOPI KENANGAN GADING Rp32.000,00.",
    ),
    deps,
  );
  const qrisRow = await find("msg-qris");
  const foodCategory = allCategories.find((c) => c.name === "Makanan & Minuman");

  check("Kategori dipilih LLM dari daftar", qrisRow?.categoryId === foodCategory?.id);
  check("Kategorisasi yakin tidak perlu direview", qrisRow?.needsReview === false);

  // --- 6. Nama sendiri disamarkan -> cocok lewat nama, wajib direview -------
  await ingestMessage(
    USER,
    email(
      "msg-masked",
      "noreply@seabank.co.id",
      "Notifikasi Transaksi",
      "Transfer sebesar Rp1.200.000 ke FAJAR A***** berhasil diproses.",
    ),
    deps,
  );
  const maskedRow = await find("msg-masked");

  check("Nama sendiri yang disamarkan tetap dikenali internal", maskedRow?.isInternalTransfer === true);
  check("Cocok nama ditandai sebagai fuzzy_name", maskedRow?.internalTransferMatchType === "fuzzy_name");
  check("Cocok nama wajib direview", maskedRow?.needsReview === true);
  check("Alasan review-nya tepat", maskedRow?.reviewReason === "fuzzy_internal_match");

  // --- 7. Email non-transaksi ----------------------------------------------
  const promo = await ingestMessage(
    USER,
    email(
      "msg-promo",
      "promo@bca.co.id",
      "Promo Kartu Kredit Juli!",
      "Dapatkan cashback hingga 50% untuk transaksi di merchant pilihan.",
    ),
    deps,
  );
  check("Email promosi tidak jadi transaksi", promo.status === "skipped_not_transaction");

  // --- 8. Sumber dikenali dari alamat pengirim ------------------------------
  check("Sumber BCA dikenali dari pengirim", qrisRow?.source === "bca");
  check("Sumber SeaBank dikenali dari pengirim", maskedRow?.source === "seabank");

  // --- 9. Aturan produk setelah pembalikan ---------------------------------
  const { summarizePeriod } = await import("../src/lib/store");
  const { allPeriod } = await import("../src/lib/period");
  const summary = summarizePeriod(await repo.listTransactions(USER), allPeriod());

  // Tarik tunai + QRIS + transfer ke pasangan. Transfer antar rekening sendiri
  // (3jt) dan yang cocok lewat nama (1,2jt) TIDAK ikut.
  const expected = 1_500_000 + 32_000 + 5_000_000;
  check(
    "Transfer ke pasangan kini masuk total pengeluaran",
    summary.expense === expected,
    `pengeluaran = ${summary.expense}, seharusnya ${expected}`,
  );
  check(
    "Transfer antar rekening sendiri tetap dikecualikan",
    summary.internalTransferTotal === 3_000_000 + 1_200_000,
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
  console.log(`\n${checks.length - failed}/${checks.length} pemeriksaan lolos.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Uji pipeline gagal dijalankan:", error);
  process.exit(1);
});
