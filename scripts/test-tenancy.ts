/**
 * Menguji isolasi antar tenant.
 *
 * Jalankan: `npm run test:tenancy`
 *
 * Ini bukan formalitas. Satu kueri yang lolos disaring berarti data keuangan
 * satu orang terlihat oleh orang lain. Uji ini menempuh dua jalur serangan
 * untuk SETIAP tabel:
 *
 * 1. **Kebocoran baca** — user A tidak boleh pernah melihat baris user B.
 * 2. **Kebocoran tulis** — user A memakai id milik B pada update/delete tidak
 *    boleh menyentuh baris B. Ini yang paling mudah terlewat: menyaring hanya
 *    `WHERE id = ?` terlihat benar sampai seseorang menebak sebuah id.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = mkdtempSync(join(tmpdir(), "ft-tenancy-"));
process.env.DATABASE_PATH = join(testDir, "test.db");

const A = "user-a";
const B = "user-b";

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function txInput(label: string) {
  return {
    source: "bca" as const,
    direction: "out" as const,
    amount: 10_000,
    occurredAt: "2026-07-20T03:00:00.000Z",
    counterpartyName: label,
    counterpartyAccountNumber: null,
    rawTransactionType: "QRIS DEBIT",
    origin: "manual_web" as const,
    gmailMessageId: null,
    rawEmailSnippet: null,
    extractionConfidence: "high" as const,
    categoryId: null,
    isInternalTransfer: false,
    internalTransferMatchType: null,
    needsReview: false,
    reviewReason: null,
  };
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/db/connection");
  const repo = await import("../src/db/repositories");

  migrate(db, { migrationsFolder: "./drizzle" });
  await repo.provisionNewUser(A);
  await repo.provisionNewUser(B);

  // --- Isi data ke kedua user ----------------------------------------------
  await repo.insertTransaction(A, txInput("MILIK A"));
  const txB = await repo.insertTransaction(B, txInput("MILIK B"));

  await repo.insertOwnAccount(A, {
    bank: "bca",
    accountNumberOrIdentifier: "1111111111",
    label: "BCA A",
    isActive: true,
  });
  await repo.insertOwnAccount(B, {
    bank: "bca",
    accountNumberOrIdentifier: "2222222222",
    label: "BCA B",
    isActive: true,
  });

  await repo.insertCashEntry(A, {
    entryType: "manual_expense_debit",
    amount: 5_000,
    transactionId: null,
    categoryId: null,
    note: "TUNAI A",
    occurredAt: "2026-07-20T03:00:00.000Z",
    origin: "manual_web",
  });
  await repo.insertCashEntry(B, {
    entryType: "manual_expense_debit",
    amount: 7_000,
    transactionId: null,
    categoryId: null,
    note: "TUNAI B",
    occurredAt: "2026-07-20T03:00:00.000Z",
    origin: "manual_web",
  });

  await repo.insertWhatsAppNumber(A, {
    phoneE164: "+6281111111111",
    label: "WA A",
    isActive: true,
  });
  await repo.insertWhatsAppNumber(B, {
    phoneE164: "+6282222222222",
    label: "WA B",
    isActive: true,
  });

  await repo.insertCategory(A, {
    name: "Khusus A",
    kind: "expense",
    isSystem: false,
    systemKey: null,
    isActive: true,
    sortOrder: 99,
  });

  await repo.updateIngestionConfig(A, { inboxEmail: "a@inbox.test" });
  await repo.updateIngestionConfig(B, { inboxEmail: "b@inbox.test" });
  await repo.writeSyncCursor(A, "gmail:last_polled_at", "2026-07-01T00:00:00Z");
  await repo.writeSyncCursor(B, "gmail:last_polled_at", "2026-07-02T00:00:00Z");

  // --- 1. Kebocoran baca ----------------------------------------------------
  const txListA = await repo.listTransactions(A);
  check(
    "Transaksi: A hanya melihat miliknya",
    txListA.length === 1 && txListA[0].counterpartyName === "MILIK A",
    `A melihat ${txListA.length} baris`,
  );

  const accountsA = await repo.listOwnAccounts(A);
  check(
    "Rekening: A hanya melihat miliknya",
    accountsA.length === 1 && accountsA[0].label === "BCA A",
  );

  const cashA = await repo.listCashEntries(A);
  check(
    "Dompet tunai: A hanya melihat miliknya",
    cashA.length === 1 && cashA[0].note === "TUNAI A",
  );

  const waA = await repo.listWhatsAppNumbers(A);
  check("Nomor WhatsApp: A hanya melihat miliknya", waA.length === 1 && waA[0].label === "WA A");

  const catA = await repo.listCategories(A);
  const catB = await repo.listCategories(B);
  check(
    "Kategori: masing-masing punya salinan sendiri",
    catA.some((c) => c.name === "Khusus A") && !catB.some((c) => c.name === "Khusus A"),
  );
  check(
    "Kategori: kategori bawaan tidak tercampur antar user",
    catB.length > 0 && catA.length === catB.length + 1,
    `A=${catA.length}, B=${catB.length}`,
  );

  const healthA = await repo.listSourceHealth(A);
  check("Status sumber: tersaring per user", healthA.length === 7, `${healthA.length} baris`);

  const configA = await repo.getIngestionConfig(A);
  check("Konfigurasi ingestion: milik A sendiri", configA.inboxEmail === "a@inbox.test");

  const cursorA = await repo.readSyncCursor(A, "gmail:last_polled_at");
  check("Kursor polling: milik A sendiri", cursorA === "2026-07-01T00:00:00Z");

  // --- 2. Kebocoran tulis: A memakai id milik B ----------------------------
  await repo.updateTransaction(A, txB, { amount: 999_999 });
  const bAfterUpdate = (await repo.listTransactions(B)).find((t) => t.id === txB);
  check(
    "A tidak bisa mengubah transaksi B",
    bAfterUpdate?.amount === 10_000,
    `nominal B jadi ${bAfterUpdate?.amount}`,
  );

  await repo.deleteTransaction(A, txB);
  check(
    "A tidak bisa menghapus transaksi B",
    (await repo.listTransactions(B)).length === 1,
  );

  const accountB = (await repo.listOwnAccounts(B))[0];
  await repo.updateOwnAccount(A, accountB.id, { label: "DIBAJAK" });
  check(
    "A tidak bisa mengubah rekening B",
    (await repo.listOwnAccounts(B))[0].label === "BCA B",
  );
  await repo.deleteOwnAccount(A, accountB.id);
  check("A tidak bisa menghapus rekening B", (await repo.listOwnAccounts(B)).length === 1);

  const cashB = (await repo.listCashEntries(B))[0];
  await repo.updateCashEntry(A, cashB.id, { amount: 999_999 });
  check(
    "A tidak bisa mengubah catatan tunai B",
    (await repo.listCashEntries(B))[0].amount === 7_000,
  );
  await repo.deleteCashEntry(A, cashB.id);
  check("A tidak bisa menghapus catatan tunai B", (await repo.listCashEntries(B)).length === 1);

  const waB = (await repo.listWhatsAppNumbers(B))[0];
  await repo.deleteWhatsAppNumber(A, waB.id);
  check("A tidak bisa menghapus nomor WA B", (await repo.listWhatsAppNumbers(B)).length === 1);

  const catBFirst = catB[0];
  await repo.deleteCategory(A, catBFirst.id);
  check(
    "A tidak bisa menghapus kategori B",
    (await repo.listCategories(B)).length === catB.length,
  );

  // --- 3. Idempotensi ingestion tersaring per user -------------------------
  await repo.insertTransaction(A, { ...txInput("EMAIL A"), gmailMessageId: "msg-sama" });
  const seenByB = await repo.transactionExistsForMessage(B, "msg-sama");
  check(
    "Id pesan Gmail yang sama di user lain tidak dianggap duplikat",
    seenByB === false,
  );
  check(
    "Id pesan Gmail yang sama di user sendiri dianggap duplikat",
    (await repo.transactionExistsForMessage(A, "msg-sama")) === true,
  );

  // --- 4. Penghapusan akun hanya menyentuh pemiliknya ----------------------
  await repo.deleteAllUserData(A);
  const leftoverA =
    (await repo.listTransactions(A)).length +
    (await repo.listCategories(A)).length +
    (await repo.listOwnAccounts(A)).length +
    (await repo.listCashEntries(A)).length +
    (await repo.listWhatsAppNumbers(A)).length +
    (await repo.listSourceHealth(A)).length;

  check("Hapus akun membersihkan seluruh data pemiliknya", leftoverA === 0, `sisa ${leftoverA}`);
  check(
    "Hapus akun A tidak menyentuh data B",
    (await repo.listTransactions(B)).length === 1 &&
      (await repo.listCategories(B)).length === catB.length &&
      (await repo.listSourceHealth(B)).length === 7,
  );

  // --- Laporan --------------------------------------------------------------
  console.log("\nHasil uji isolasi tenant:\n");
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
  console.error("Uji isolasi gagal dijalankan:", error);
  process.exit(1);
});
