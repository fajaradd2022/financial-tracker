"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as repo from "@/db/repositories";
import { auth } from "@/lib/auth";
import { findSystemCategory } from "@/lib/llm/categorize";

/**
 * Server action untuk fitur kolaborasi.
 *
 * Sama seperti `actions.ts`: identitas pemanggil SELALU dari sesi, tidak pernah
 * dari argumen. Di sini taruhannya lebih tinggi — action-nya menulis ke buku
 * keuangan orang lain, jadi setiap jalur memeriksa dulu bahwa hubungan
 * kolaborasinya memang ada dan sudah disetujui.
 */

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Tidak terautentikasi.");
  return session.user.id;
}

function refreshAll() {
  revalidatePath("/", "layout");
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Hubungan
// ---------------------------------------------------------------------------

export async function inviteCollaboratorAction(
  email: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const target = await repo.findUserByEmail(email);

  // Pesannya sengaja sama untuk "email tidak terdaftar" dan "sudah terhubung"
  // tidak dibedakan lebih jauh dari yang perlu — tapi email tak terdaftar tetap
  // harus dibedakan agar user tahu ia salah ketik. Instalasi ini tertutup
  // (akun dibuat admin), jadi risiko penelusuran akun rendah.
  if (!target) {
    return { ok: false, message: "Tidak ada pengguna dengan email itu." };
  }
  if (target.userId === userId) {
    return { ok: false, message: "Tidak bisa berkolaborasi dengan diri sendiri." };
  }

  const existing = await repo.findCollaborationBetween(userId, target.userId);

  if (existing) {
    if (existing.status === "accepted") {
      return { ok: false, message: "Kalian sudah terhubung." };
    }

    if (existing.status === "pending") {
      // Dibedakan: kalau DIA yang mengundang duluan, yang perlu dilakukan
      // bukan mengundang lagi melainkan menerima undangannya. Tanpa pembedaan
      // ini, user terjebak menekan "undang" berulang kali tanpa tahu jawabannya
      // sudah menunggu di daftar undangan masuk.
      return existing.requesterUserId === userId
        ? { ok: false, message: "Undangan Anda untuk pengguna ini masih menunggu jawabannya." }
        : {
            ok: false,
            message:
              "Pengguna ini sudah lebih dulu mengundang Anda. Terima undangannya di daftar Undangan masuk.",
          };
    }

    // Sisanya berstatus "revoked" — hubungan yang pernah diputus. Barisnya
    // dipakai ulang karena unique(requester, addressee) menolak baris kedua
    // untuk pasangan yang sama; tanpa ini, mengundang ulang selalu gagal.
    await repo.reopenCollaboration(existing.id, userId, target.userId);
    refreshAll();
    return { ok: true };
  }

  await repo.insertCollaboration(userId, target.userId);
  refreshAll();
  return { ok: true };
}

export async function respondToInvitationAction(
  collaborationId: string,
  accept: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId();
  // `onlyAddressee`: hanya yang diundang boleh menerima. Tanpa ini, pengundang
  // bisa menyetujui undangannya sendiri dan persetujuan jadi tidak ada artinya.
  await repo.updateCollaborationStatus(
    userId,
    collaborationId,
    accept ? "accepted" : "revoked",
    { onlyAddressee: true },
  );
  refreshAll();
  return { ok: true };
}

/**
 * Memutus hubungan TANPA menghapus riwayat.
 *
 * Barisnya ditandai "revoked": kantong berhenti dihitung dan pasangan tidak
 * bisa lagi saling mengirim dana, tapi entri dana yang pernah terjadi tetap
 * terbaca di daftar "Dana yang Anda kirim".
 *
 * Ini pilihan yang tepat untuk hubungan yang selesai secara wajar — uang yang
 * pernah diberikan tetap punya jejak, dan kalau nanti berkolaborasi lagi,
 * hubungannya tinggal dibuka kembali lewat undangan baru.
 */
export async function revokeCollaborationAction(
  collaborationId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  await repo.updateCollaborationStatus(userId, collaborationId, "revoked");
  refreshAll();
  return { ok: true };
}

/**
 * Memutus SEKALIGUS menghapus seluruh jejaknya dari database.
 *
 * Riwayat kantong (entri dana) ikut hilang di kedua sisi, dan penandaan
 * "dibayar dari dana X" pada transaksi dibersihkan. Transaksi pemasukan &
 * pengeluaran masing-masing pihak tetap utuh — uangnya benar-benar berpindah.
 *
 * Tidak bisa dibatalkan; dipisahkan dari `revokeCollaborationAction` supaya
 * pilihan yang merusak tidak pernah terjadi karena salah pencet.
 */
export async function deleteCollaborationAction(
  collaborationId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  await repo.deleteCollaboration(userId, collaborationId);
  refreshAll();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Entri dana
// ---------------------------------------------------------------------------

/**
 * Menandai sebuah pengeluaran sebagai dana yang diberikan ke kolaborator.
 *
 * Yang dibuat di sisi penerima hanyalah entri berstatus `pending_match` — belum
 * mengubah angka apa pun di bukunya. Kalau di sini langsung dibuatkan transaksi
 * pemasukan, dan email bank penerima juga masuk, pemasukannya terhitung dua kali.
 */
export async function markTransactionAsCollaborationAction(
  transactionId: string,
  collaborationId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const collaboration = (await repo.listCollaborations(userId)).find(
    (c) => c.id === collaborationId,
  );
  if (!collaboration || collaboration.status !== "accepted") {
    return { ok: false, message: "Hubungan kolaborasi tidak aktif." };
  }

  const transaction = (await repo.listTransactions(userId)).find(
    (t) => t.id === transactionId,
  );
  if (!transaction) return { ok: false, message: "Transaksi tidak ditemukan." };
  if (transaction.direction !== "out") {
    return { ok: false, message: "Hanya pengeluaran yang bisa ditandai." };
  }

  const categories = await repo.listCategories(userId);
  const category = findSystemCategory(categories, "collaboration_out");

  await repo.updateTransaction(userId, transactionId, {
    // Transfer ke kolaborator adalah pengeluaran sungguhan — bukan transfer
    // internal. Penandaan ini sekaligus memperbaiki tebakan pipeline.
    isInternalTransfer: false,
    internalTransferMatchType: null,
    categoryId: category?.id ?? transaction.categoryId,
    needsReview: false,
    reviewReason: null,
  });

  await repo.insertCollaborationEntry({
    collaborationId,
    fromUserId: userId,
    toUserId: collaboration.partnerUserId,
    amount: transaction.amount,
    occurredAt: transaction.occurredAt,
    note: transaction.counterpartyName,
    senderTransactionId: transactionId,
  });

  refreshAll();
  return { ok: true };
}

/**
 * Penerima mengaitkan entri ke transaksi pemasukan yang SUDAH ada.
 *
 * Inilah jalur normalnya untuk transfer bank: pemasukannya sudah tercatat
 * sendiri dari email bank, jadi yang perlu dilakukan hanya menempelkan label —
 * bukan menambah transaksi baru.
 */
export async function linkCollaborationEntryAction(
  entryId: string,
  transactionId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const entry = await repo.getCollaborationEntry(userId, entryId);
  if (!entry || entry.toUserId !== userId) {
    return { ok: false, message: "Entri tidak ditemukan." };
  }

  const transaction = (await repo.listTransactions(userId)).find(
    (t) => t.id === transactionId,
  );
  if (!transaction) return { ok: false, message: "Transaksi tidak ditemukan." };

  const categories = await repo.listCategories(userId);
  const category = findSystemCategory(categories, "collaboration_in");

  await repo.updateTransaction(userId, transactionId, {
    categoryId: category?.id ?? transaction.categoryId,
  });
  await repo.updateCollaborationEntry(userId, entryId, {
    status: "linked",
    recipientTransactionId: transactionId,
  });

  refreshAll();
  return { ok: true };
}

/**
 * Penerima menerima entri tanpa pasangan — dipakai untuk pemberian tunai, yang
 * memang tidak menghasilkan email bank apa pun. Di sinilah, dan hanya di sini,
 * sistem membuat transaksi pemasukan.
 */
export async function acceptCollaborationEntryAction(
  entryId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const entry = await repo.getCollaborationEntry(userId, entryId);
  if (!entry || entry.toUserId !== userId) {
    return { ok: false, message: "Entri tidak ditemukan." };
  }
  if (entry.status !== "pending_match") {
    return { ok: false, message: "Entri ini sudah diproses." };
  }

  const categories = await repo.listCategories(userId);
  const category = findSystemCategory(categories, "collaboration_in");

  const transactionId = await repo.insertTransaction(userId, {
    source: "manual_other",
    direction: "in",
    amount: entry.amount,
    occurredAt: entry.occurredAt,
    counterpartyName: entry.note ?? "Dana kolaborasi",
    counterpartyAccountNumber: null,
    rawTransactionType: "DANA KOLABORASI",
    origin: "manual_web",
    gmailMessageId: null,
    rawEmailSnippet: null,
    extractionConfidence: "high",
    categoryId: category?.id ?? null,
    isInternalTransfer: false,
    internalTransferMatchType: null,
    needsReview: false,
    reviewReason: null,
    fundedByCollaborationId: null,
  });

  await repo.updateCollaborationEntry(userId, entryId, {
    status: "accepted",
    recipientTransactionId: transactionId,
  });

  refreshAll();
  return { ok: true };
}

/**
 * Pemberi menghapus entri dana yang pernah ia kirim.
 *
 * Yang dihapus HANYA entrinya. Transaksi pengeluaran di sisi pemberi dan
 * transaksi pemasukan di sisi penerima tetap utuh — keduanya catatan uang yang
 * benar-benar berpindah, bukan sekadar tautan. Menghapusnya berarti menulis
 * ulang sejarah keuangan orang.
 *
 * Akibatnya pada kantong: kredit berkurang. Kalau penerima sudah menandai
 * belanja lebih besar dari sisa kredit, kantongnya jadi minus — dan itu
 * ditampilkan apa adanya, bukan disembunyikan.
 */
export async function deleteCollaborationEntryAction(
  entryId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const entry = await repo.getCollaborationEntry(userId, entryId);
  if (!entry) return { ok: false, message: "Entri tidak ditemukan." };

  if (entry.fromUserId !== userId) {
    return {
      ok: false,
      message: "Hanya pengirim dana yang bisa menghapus entri ini.",
    };
  }

  await repo.deleteCollaborationEntry(userId, entryId);
  refreshAll();
  return { ok: true };
}

export async function rejectCollaborationEntryAction(
  entryId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  await repo.updateCollaborationEntry(userId, entryId, { status: "rejected" });
  refreshAll();
  return { ok: true };
}

/**
 * Penerima menandai sebuah pengeluarannya sebagai "dibayar dari dana [X]".
 *
 * Ini satu-satunya cara angka "terpakai" bisa terisi — uang di rekening sudah
 * bercampur, jadi sistem tidak bisa menebak rupiah mana yang berasal dari siapa.
 */
export async function setTransactionFundingAction(
  transactionId: string,
  collaborationId: string | null,
): Promise<ActionResult> {
  const userId = await requireUserId();

  if (collaborationId) {
    const collaboration = (await repo.listCollaborations(userId)).find(
      (c) => c.id === collaborationId,
    );
    if (!collaboration || collaboration.status !== "accepted") {
      return { ok: false, message: "Hubungan kolaborasi tidak aktif." };
    }
  }

  await repo.updateTransaction(userId, transactionId, {
    fundedByCollaborationId: collaborationId,
  });
  refreshAll();
  return { ok: true };
}
