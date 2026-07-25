import type { InternalMatchType, OwnAccount } from "@/lib/types";

/**
 * Deteksi transfer antar rekening milik sendiri.
 *
 * Ini aturan produk yang paling menentukan benar-tidaknya angka pengeluaran:
 * memindahkan uang dari BCA ke SeaBank milik sendiri bukan pengeluaran, tapi
 * bagi bank tetap tercatat sebagai transfer keluar.
 *
 * Dua jalur, dengan tingkat keyakinan berbeda:
 * 1. **Nomor rekening** — cocok persis dengan daftar rekening sendiri. Ini
 *    bukti kuat, tidak perlu direview.
 * 2. **Nama** — dipakai hanya kalau nomor rekening tidak ada di email (banyak
 *    bank menyamarkannya). Kemiripan nama bisa saja kebetulan, jadi hasilnya
 *    selalu ditandai perlu direview.
 */

export interface InternalMatch {
  isInternal: boolean;
  matchType: InternalMatchType | null;
  /** true kalau keyakinannya rendah sehingga perlu dikonfirmasi manusia. */
  needsReview: boolean;
  matchedAccountId?: string;
}

const NOT_INTERNAL: InternalMatch = {
  isInternal: false,
  matchType: null,
  needsReview: false,
};

/** Menyisakan angka saja: "1234-5678 90" dan "1234567890" jadi sama. */
function normalizeAccountNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Menormalkan nama untuk dibandingkan: huruf besar, tanpa gelar/tanda baca,
 * dan tanpa spasi ganda. Bank menulis nama dengan format yang tidak konsisten.
 */
function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(BAPAK|IBU|BP|SDR|SDRI|MR|MRS|TN|NY)\b/g, "")
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kemiripan berbasis token, bukan jarak edit karakter.
 *
 * Dipilih karena bentuk kegagalan yang nyata di sini adalah nama yang
 * dipotong atau disamarkan ("ANNISA P*****", "ANNISA"), bukan salah ketik.
 * Jarak edit akan menilai "ANNISA" vs "ANNISA PUTRI" sangat berbeda, padahal
 * itu justru kasus yang harus dikenali.
 */
function nameSimilarity(a: string, b: string): number {
  const tokensA = normalizeName(a).split(" ").filter(Boolean);
  const tokensB = normalizeName(b).split(" ").filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

  let matched = 0;
  for (const token of shorter) {
    // Token pendek (< 3 huruf) diabaikan: terlalu mudah cocok kebetulan.
    if (token.length < 3) continue;
    const hit = longer.some(
      (other) => other.startsWith(token) || token.startsWith(other),
    );
    if (hit) matched += 1;
  }

  const comparable = shorter.filter((t) => t.length >= 3).length;
  return comparable === 0 ? 0 : matched / comparable;
}

/** Ambang kemiripan nama. Sengaja tinggi — salah tandai lebih mahal daripada gagal tandai. */
export const NAME_MATCH_THRESHOLD = 0.75;

export function matchInternalTransfer({
  counterpartyAccountNumber,
  counterpartyName,
  ownAccounts,
  ownerNames,
}: {
  counterpartyAccountNumber: string | null;
  counterpartyName: string | null;
  ownAccounts: OwnAccount[];
  /** Nama pemilik rekening (suami & istri) beserta variasinya. */
  ownerNames: string[];
}): InternalMatch {
  const active = ownAccounts.filter((a) => a.isActive);

  // Jalur 1: nomor rekening — bukti kuat.
  if (counterpartyAccountNumber) {
    const target = normalizeAccountNumber(counterpartyAccountNumber);
    if (target) {
      const hit = active.find(
        (a) => normalizeAccountNumber(a.accountNumberOrIdentifier) === target,
      );
      if (hit) {
        return {
          isInternal: true,
          matchType: "account_number",
          needsReview: false,
          matchedAccountId: hit.id,
        };
      }
      // Nomor ada tapi bukan milik sendiri: ini transfer ke pihak lain.
      // Berhenti di sini — jangan jatuh ke pencocokan nama, karena nama yang
      // kebetulan mirip tidak boleh mengalahkan nomor rekening yang jelas beda.
      return NOT_INTERNAL;
    }
  }

  // Jalur 2: nama — hanya saat nomor rekening tidak tersedia.
  if (counterpartyName) {
    const best = ownerNames.reduce(
      (max, name) => Math.max(max, nameSimilarity(counterpartyName, name)),
      0,
    );
    if (best >= NAME_MATCH_THRESHOLD) {
      return {
        isInternal: true,
        matchType: "fuzzy_name",
        needsReview: true,
      };
    }
  }

  return NOT_INTERNAL;
}
