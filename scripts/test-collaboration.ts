/**
 * Menguji fitur kolaborasi.
 *
 * Jalankan: `npm run test:collaboration`
 *
 * Yang dijaga di sini ada tiga, dan ketiganya adalah hal yang kalau salah akan
 * menghasilkan angka keuangan yang keliru tanpa ada yang menyadarinya:
 *
 * 1. **Anti penghitungan ganda.** Entri kolaborasi tidak boleh menambah angka
 *    apa pun sebelum dikaitkan/diterima, dan setelah dikaitkan pemasukannya
 *    harus terhitung tepat satu kali.
 * 2. **Kantong bersaldo.** "Terpakai" hanya terisi dari penandaan penerima.
 * 3. **Batas privasi.** Ringkasan untuk pemberi hanya berisi angka — tidak
 *    boleh ada baris transaksi penerima yang ikut menyeberang.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = mkdtempSync(join(tmpdir(), "ft-collab-"));
process.env.DATABASE_PATH = join(testDir, "test.db");

const SUAMI = "user-suami";
const ISTRI = "user-istri";

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function tx(over: Record<string, unknown> = {}) {
  return {
    source: "bca" as const,
    direction: "out" as const,
    amount: 5_000_000,
    occurredAt: "2026-07-25T03:20:00.000Z",
    counterpartyName: "ANNISA PUTRI",
    counterpartyAccountNumber: null,
    rawTransactionType: "TRANSFER KELUAR",
    origin: "manual_web" as const,
    gmailMessageId: null,
    rawEmailSnippet: null,
    extractionConfidence: "high" as const,
    categoryId: null,
    isInternalTransfer: false,
    internalTransferMatchType: null,
    needsReview: false,
    reviewReason: null,
    ...over,
  };
}

async function main() {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("../src/db/connection");
  const repo = await import("../src/db/repositories");
  const { summarizePeriod } = await import("../src/lib/store");
  const { allPeriod } = await import("../src/lib/period");
  const { findMatchCandidates } = await import(
    "../src/lib/domain/collaboration"
  );

  migrate(db, { migrationsFolder: "./drizzle" });
  await repo.provisionNewUser(SUAMI);
  await repo.provisionNewUser(ISTRI);
  await repo.upsertUserDirectory(SUAMI, "Fajar", "suami@test.local");
  await repo.upsertUserDirectory(ISTRI, "Annisa", "istri@test.local");

  // --- 1. Hubungan butuh persetujuan --------------------------------------
  await repo.insertCollaboration(SUAMI, ISTRI);
  const beforeAccept = await repo.getCollaborationSummaries(SUAMI);
  check(
    "Hubungan belum diterima tidak muncul sebagai kantong",
    beforeAccept.length === 0,
  );

  const invite = (await repo.listCollaborations(ISTRI))[0];
  check("Undangan terlihat oleh yang diundang", invite?.isRequester === false);

  // Pengundang tidak boleh menyetujui undangannya sendiri.
  await repo.updateCollaborationStatus(SUAMI, invite.id, "accepted", {
    onlyAddressee: true,
  });
  check(
    "Pengundang tidak bisa menyetujui undangannya sendiri",
    (await repo.listCollaborations(SUAMI))[0].status === "pending",
  );

  await repo.updateCollaborationStatus(ISTRI, invite.id, "accepted", {
    onlyAddressee: true,
  });
  check(
    "Yang diundang bisa menerima",
    (await repo.listCollaborations(SUAMI))[0].status === "accepted",
  );

  const collabId = invite.id;

  // --- 2. Suami menandai pengeluaran sebagai dana kolaborasi ---------------
  const senderTxId = await repo.insertTransaction(SUAMI, tx());
  await repo.insertCollaborationEntry({
    collaborationId: collabId,
    fromUserId: SUAMI,
    toUserId: ISTRI,
    amount: 5_000_000,
    occurredAt: "2026-07-25T03:20:00.000Z",
    note: "Uang bulanan",
    senderTransactionId: senderTxId,
  });

  const suamiExpense = summarizePeriod(
    await repo.listTransactions(SUAMI),
    allPeriod(),
  ).expense;
  check(
    "Dana ke kolaborator terhitung pengeluaran di sisi pemberi",
    suamiExpense === 5_000_000,
    `pengeluaran = ${suamiExpense}`,
  );

  // --- 3. Sebelum dicocokkan, angka istri tidak berubah -------------------
  const istriBefore = summarizePeriod(
    await repo.listTransactions(ISTRI),
    allPeriod(),
  );
  check(
    "Entri menunggu belum menambah pemasukan penerima",
    istriBefore.income === 0,
    `pemasukan = ${istriBefore.income}`,
  );

  const pendingSummary = (await repo.getCollaborationSummaries(SUAMI))[0];
  check(
    "Entri menunggu belum masuk saldo kantong",
    pendingSummary.total === 0 && pendingSummary.pendingCount === 1,
    `total=${pendingSummary.total} pending=${pendingSummary.pendingCount}`,
  );

  // --- 4. Email bank istri masuk sendiri (jalur ingestion normal) ---------
  const istriIncomeId = await repo.insertTransaction(
    ISTRI,
    tx({
      direction: "in",
      counterpartyName: "FAJAR ADITYA",
      occurredAt: "2026-07-25T04:00:00.000Z",
      origin: "email",
      gmailMessageId: "msg-istri-1",
    }),
  );

  const entry = (await repo.listCollaborationEntries(ISTRI))[0];
  const candidates = findMatchCandidates(
    entry,
    await repo.listTransactions(ISTRI),
  );
  check(
    "Pemasukan yang cocok ditemukan sebagai kandidat",
    candidates.length === 1 && candidates[0].id === istriIncomeId,
  );

  // --- 5. Dikaitkan: terhitung TEPAT satu kali ----------------------------
  await repo.updateCollaborationEntry(ISTRI, entry.id, {
    status: "linked",
    recipientTransactionId: istriIncomeId,
  });

  const istriAfter = summarizePeriod(
    await repo.listTransactions(ISTRI),
    allPeriod(),
  );
  check(
    "Setelah dikaitkan, pemasukan terhitung tepat sekali",
    istriAfter.income === 5_000_000,
    `pemasukan = ${istriAfter.income}`,
  );
  check(
    "Tidak ada transaksi tambahan yang dibuat saat mengaitkan",
    (await repo.listTransactions(ISTRI)).length === 1,
  );

  const linkedSummary = (await repo.getCollaborationSummaries(SUAMI))[0];
  check(
    "Saldo kantong terisi setelah dikaitkan",
    linkedSummary.total === 5_000_000 && linkedSummary.pendingCount === 0,
  );
  check(
    "Belum ditandai apa pun, jadi terpakai masih nol",
    linkedSummary.spent === 0 && linkedSummary.remaining === 5_000_000,
  );

  // --- 6. Istri menandai belanjanya sebagai dari dana kolaborasi ----------
  const belanjaId = await repo.insertTransaction(
    ISTRI,
    tx({
      amount: 1_250_000,
      direction: "out",
      counterpartyName: "TOKOPEDIA",
      occurredAt: "2026-07-26T03:00:00.000Z",
    }),
  );
  await repo.updateTransaction(ISTRI, belanjaId, {
    fundedByCollaborationId: collabId,
  });

  const spentSummary = (await repo.getCollaborationSummaries(SUAMI))[0];
  check(
    "Penandaan penerima mengisi angka terpakai",
    spentSummary.spent === 1_250_000,
    `terpakai = ${spentSummary.spent}`,
  );
  check(
    "Sisa = diberi − terpakai",
    spentSummary.remaining === 3_750_000,
    `sisa = ${spentSummary.remaining}`,
  );

  // --- 7. Batas privasi ---------------------------------------------------
  const serialized = JSON.stringify(spentSummary);
  check(
    "Ringkasan pemberi tidak memuat nama transaksi penerima",
    !serialized.includes("TOKOPEDIA"),
    serialized,
  );
  check(
    "Ringkasan pemberi hanya berisi field angka & identitas partner",
    Object.keys(spentSummary).sort().join(",") ===
      [
        "collaborationId",
        "direction",
        "partnerEmail",
        "partnerName",
        "pendingCount",
        "remaining",
        "spent",
        "total",
      ].join(","),
    Object.keys(spentSummary).sort().join(","),
  );

  // --- 8. Arah dilihat dari masing-masing sisi ----------------------------
  const fromIstri = (await repo.getCollaborationSummaries(ISTRI))[0];
  check("Pemberi melihat arah keluar", spentSummary.direction === "out");
  check("Penerima melihat arah masuk", fromIstri.direction === "in");

  // --- 9. Pemberian tunai: tidak ada email, harus bisa diterima manual ----
  await repo.insertCollaborationEntry({
    collaborationId: collabId,
    fromUserId: SUAMI,
    toUserId: ISTRI,
    amount: 300_000,
    occurredAt: "2026-07-27T03:00:00.000Z",
    note: "Uang tunai",
    senderTransactionId: null,
  });
  const cashEntry = (await repo.listCollaborationEntries(ISTRI)).find(
    (e) => e.amount === 300_000,
  )!;
  const cashTxId = await repo.insertTransaction(
    ISTRI,
    tx({
      direction: "in",
      amount: 300_000,
      counterpartyName: "Uang tunai",
      occurredAt: "2026-07-27T03:00:00.000Z",
      source: "manual_other",
    }),
  );
  await repo.updateCollaborationEntry(ISTRI, cashEntry.id, {
    status: "accepted",
    recipientTransactionId: cashTxId,
  });

  const finalSummary = (await repo.getCollaborationSummaries(SUAMI))[0];
  check(
    "Pemberian tunai yang diterima menambah saldo kantong",
    finalSummary.total === 5_300_000,
    `total = ${finalSummary.total}`,
  );

  // --- 10. Entri ditolak tidak pernah memengaruhi angka -------------------
  await repo.insertCollaborationEntry({
    collaborationId: collabId,
    fromUserId: SUAMI,
    toUserId: ISTRI,
    amount: 999_000,
    occurredAt: "2026-07-28T03:00:00.000Z",
    note: "Salah kirim",
    senderTransactionId: null,
  });
  const wrong = (await repo.listCollaborationEntries(ISTRI)).find(
    (e) => e.amount === 999_000,
  )!;
  await repo.updateCollaborationEntry(ISTRI, wrong.id, { status: "rejected" });

  check(
    "Entri ditolak tidak menambah saldo kantong",
    (await repo.getCollaborationSummaries(SUAMI))[0].total === 5_300_000,
  );

  // --- 11. Penerima saja yang boleh mengubah status entri -----------------
  await repo.insertCollaborationEntry({
    collaborationId: collabId,
    fromUserId: SUAMI,
    toUserId: ISTRI,
    amount: 111_000,
    occurredAt: "2026-07-29T03:00:00.000Z",
    note: "Uji wewenang",
    senderTransactionId: null,
  });
  const guarded = (await repo.listCollaborationEntries(SUAMI)).find(
    (e) => e.amount === 111_000,
  )!;
  await repo.updateCollaborationEntry(SUAMI, guarded.id, { status: "accepted" });
  const stillPending = (await repo.listCollaborationEntries(ISTRI)).find(
    (e) => e.amount === 111_000,
  )!;
  check(
    "Pemberi tidak bisa menyatakan sendiri dananya diterima",
    stillPending.status === "pending_match",
    `status = ${stillPending.status}`,
  );

  // --- 12. Hapus entri dana: hanya pengirim, transaksi tetap utuh ---------
  const beforeDelete = (await repo.getCollaborationSummaries(SUAMI))[0];
  const cashEntryToDelete = (await repo.listCollaborationEntries(SUAMI)).find(
    (e) => e.amount === 300_000,
  )!;

  // Penerima mencoba menghapus entri milik pemberi — harus tidak berpengaruh.
  await repo.deleteCollaborationEntry(ISTRI, cashEntryToDelete.id);
  check(
    "Penerima tidak bisa menghapus entri milik pemberi",
    (await repo.listCollaborationEntries(SUAMI)).some(
      (e) => e.id === cashEntryToDelete.id,
    ),
  );
  check(
    "Saldo kantong tidak berubah setelah percobaan itu",
    (await repo.getCollaborationSummaries(SUAMI))[0].total === beforeDelete.total,
  );

  // Pengirim menghapus entrinya sendiri.
  const recipientTxCountBefore = (await repo.listTransactions(ISTRI)).length;
  await repo.deleteCollaborationEntry(SUAMI, cashEntryToDelete.id);

  check(
    "Pengirim bisa menghapus entrinya sendiri",
    !(await repo.listCollaborationEntries(SUAMI)).some(
      (e) => e.id === cashEntryToDelete.id,
    ),
  );
  check(
    "Kredit kantong berkurang sebesar nominalnya",
    (await repo.getCollaborationSummaries(SUAMI))[0].total ===
      beforeDelete.total - 300_000,
    `total = ${(await repo.getCollaborationSummaries(SUAMI))[0].total}`,
  );
  check(
    "Transaksi penerima TIDAK ikut terhapus",
    (await repo.listTransactions(ISTRI)).length === recipientTxCountBefore,
    "uangnya benar-benar berpindah, catatannya harus tetap ada",
  );

  // --- 13. Baris "revoked" lama tetap bisa dibuka kembali ------------------
  //
  // Bug yang pernah terjadi: `findCollaborationBetween` mengembalikan baris apa
  // pun termasuk yang "revoked", sehingga undangan berikutnya diblokir dengan
  // pesan "Undangan untuk pengguna ini sudah ada" padahal hubungannya sudah
  // putus. Sejak memutus berarti menghapus, status ini tidak lahir lagi — tapi
  // jalurnya tetap diuji untuk database yang sudah terlanjur punya baris lama.
  await repo.updateCollaborationStatus(SUAMI, collabId, "revoked");
  check(
    "Hubungan revoked tidak lagi muncul sebagai kantong",
    (await repo.getCollaborationSummaries(SUAMI)).length === 0,
  );

  const afterRevoke = await repo.findCollaborationBetween(SUAMI, ISTRI);
  await repo.reopenCollaboration(afterRevoke!.id, SUAMI, ISTRI);
  check(
    "Baris revoked lama bisa dibuka kembali",
    (await repo.listCollaborations(SUAMI))[0].status === "pending",
  );
  check(
    "Barisnya dipakai ulang, tidak menggandakan",
    (await repo.listCollaborations(SUAMI)).length === 1,
  );

  // Arah undangan bisa terbalik saat dibuka ulang.
  await repo.updateCollaborationStatus(SUAMI, collabId, "revoked");
  const beforeSwap = await repo.findCollaborationBetween(SUAMI, ISTRI);
  await repo.reopenCollaboration(beforeSwap!.id, ISTRI, SUAMI);
  check(
    "Yang mengundang ulang bisa pihak yang berbeda",
    (await repo.findCollaborationBetween(SUAMI, ISTRI))?.requesterUserId ===
      ISTRI,
  );

  // --- 14a. Putus TANPA hapus riwayat -------------------------------------
  //
  // Dua jalur memutus harus benar-benar berbeda akibatnya, bukan sekadar beda
  // label tombol. Yang ini menghentikan hubungan tapi menyisakan jejaknya.
  await repo.updateCollaborationStatus(SUAMI, collabId, "accepted", {
    onlyAddressee: false,
  });
  const entriesBeforeSoft = (await repo.listCollaborationEntries(SUAMI)).length;
  const taggedBeforeSoft = (await repo.listTransactions(ISTRI)).filter(
    (t) => t.fundedByCollaborationId === collabId,
  ).length;

  await repo.updateCollaborationStatus(SUAMI, collabId, "revoked");

  check(
    "Putus-simpan: hubungan berhenti dihitung sebagai kantong",
    (await repo.getCollaborationSummaries(SUAMI)).length === 0,
  );
  check(
    "Putus-simpan: riwayat entri dana TETAP ada",
    (await repo.listCollaborationEntries(SUAMI)).length === entriesBeforeSoft,
    `${(await repo.listCollaborationEntries(SUAMI)).length} vs ${entriesBeforeSoft}`,
  );
  check(
    "Putus-simpan: penandaan pada transaksi TETAP ada",
    (await repo.listTransactions(ISTRI)).filter(
      (t) => t.fundedByCollaborationId === collabId,
    ).length === taggedBeforeSoft,
  );
  check(
    "Putus-simpan: barisnya masih ada untuk dibuka kembali",
    (await repo.findCollaborationBetween(SUAMI, ISTRI))?.status === "revoked",
  );

  // --- 14b. Putus SEKALIGUS hapus riwayat ---------------------------------
  await repo.updateCollaborationStatus(SUAMI, collabId, "accepted", {
    onlyAddressee: false,
  });
  // Pastikan ada yang bisa hilang: entri dana + transaksi bertanda.
  const entriesBefore = (await repo.listCollaborationEntries(SUAMI)).length;
  const taggedBefore = (await repo.listTransactions(ISTRI)).filter(
    (t) => t.fundedByCollaborationId === collabId,
  ).length;
  const istriTxBefore = (await repo.listTransactions(ISTRI)).length;
  const suamiTxBefore = (await repo.listTransactions(SUAMI)).length;

  check("Ada entri dana sebelum diputus", entriesBefore > 0);
  check("Ada transaksi bertanda sebelum diputus", taggedBefore > 0);

  // Orang luar tidak boleh bisa memutus hubungan orang lain.
  await repo.deleteCollaboration("user-asing", collabId);
  check(
    "Pihak luar tidak bisa memutus hubungan orang lain",
    (await repo.listCollaborations(SUAMI)).length === 1,
  );

  await repo.deleteCollaboration(SUAMI, collabId);

  check(
    "Memutus menghapus baris hubungan dari database",
    (await repo.listCollaborations(SUAMI)).length === 0 &&
      (await repo.findCollaborationBetween(SUAMI, ISTRI)) === null,
  );
  check(
    "Entri dana ikut terhapus (cascade)",
    (await repo.listCollaborationEntries(SUAMI)).length === 0,
  );
  check(
    "Penandaan dana pada transaksi penerima dibersihkan",
    (await repo.listTransactions(ISTRI)).every(
      (t) => t.fundedByCollaborationId === null,
    ),
    "tanpa ini, transaksi menunjuk hubungan yang sudah tidak ada",
  );
  check(
    "Transaksi penerima TIDAK ikut terhapus",
    (await repo.listTransactions(ISTRI)).length === istriTxBefore,
  );
  check(
    "Transaksi pemberi TIDAK ikut terhapus",
    (await repo.listTransactions(SUAMI)).length === suamiTxBefore,
  );

  // Setelah dihapus, mengundang lagi harus jadi undangan baru yang bersih.
  await repo.insertCollaboration(SUAMI, ISTRI);
  check(
    "Mengundang lagi setelah diputus berhasil sebagai undangan baru",
    (await repo.findCollaborationBetween(SUAMI, ISTRI))?.status === "pending",
  );

  // --- Laporan ------------------------------------------------------------
  console.log("\nHasil uji kolaborasi:\n");
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
  console.error("Uji kolaborasi gagal dijalankan:", error);
  process.exit(1);
});
