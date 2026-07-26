import * as repo from "@/db/repositories";
import { computeCashBalance } from "@/lib/domain/cash-wallet";
import { formatIDR } from "@/lib/format";
import { hasWahaConfig, sendText } from "@/lib/waha/client";

/**
 * Notifikasi keluar lewat WhatsApp.
 *
 * Dipanggil dari penjadwal, bukan dari jalur permintaan web — user tidak perlu
 * membuka aplikasi untuk tahu ada yang tidak beres.
 */

/** Kunci penanda agar satu kondisi tidak dikirim berulang tiap putaran. */
const NEGATIVE_BALANCE_KEY = "wa:notified_negative_cash";

/**
 * Memberi tahu kalau saldo dompet tunai minus.
 *
 * Saldo minus berarti pengeluaran tunai yang dicatat melebihi uang tunai yang
 * masuk — biasanya karena ada penarikan yang belum tercatat, atau salah ketik
 * nominal. Perlu diketahui cepat karena makin lama makin sulit ditelusuri.
 *
 * Dikirim SEKALI per kejadian: penanda disimpan saat dikirim dan baru dibuang
 * ketika saldo kembali normal. Tanpa itu, saldo minus yang belum sempat
 * dibetulkan akan mengirim pesan yang sama setiap beberapa menit.
 */
export async function notifyNegativeCashBalance(userId: string) {
  if (!hasWahaConfig()) return;

  const balance = computeCashBalance(await repo.listCashEntries(userId));
  const alreadyNotified = await repo.readSyncCursor(userId, NEGATIVE_BALANCE_KEY);

  if (balance >= 0) {
    if (alreadyNotified) {
      await repo.writeSyncCursor(userId, NEGATIVE_BALANCE_KEY, "");
    }
    return;
  }

  if (alreadyNotified) return;

  const numbers = await repo.listActiveNumbersForUser(userId);
  if (numbers.length === 0) return;

  const message = [
    "⚠️ Saldo dompet tunai minus",
    "",
    `Pengeluaran tunai yang tercatat melebihi uang masuk sebesar ${formatIDR(Math.abs(balance))}.`,
    "",
    "Kemungkinan ada tarik tunai yang belum tercatat, atau nominal yang salah ketik.",
  ].join("\n");

  for (const phone of numbers) {
    // Satu nomor yang gagal tidak boleh menghalangi nomor lainnya.
    try {
      await sendText(phone, message);
    } catch (error) {
      console.error(`[whatsapp] gagal mengirim ke ${phone}:`, error);
    }
  }

  await repo.writeSyncCursor(userId, NEGATIVE_BALANCE_KEY, new Date().toISOString());
}
