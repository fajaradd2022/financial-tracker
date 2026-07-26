import * as repo from "@/db/repositories";
import { computeCashBalance } from "@/lib/domain/cash-wallet";
import { dayKey, formatDate, formatIDR, fromDateInputValue } from "@/lib/format";
import { findSystemCategory } from "@/lib/llm/categorize";
import type { ToolDefinition } from "@/lib/llm/openrouter";
import { allPeriod, monthPeriod, type Period } from "@/lib/period";
import { summarizePeriod } from "@/lib/store";

/**
 * Tool yang bisa dipanggil agent WhatsApp.
 *
 * Semuanya adalah adapter TIPIS di atas `repositories.ts` dan modul domain yang
 * sudah ada — tidak ada aturan bisnis yang ditulis ulang di sini. Kalau logika
 * dompet tunai atau transfer internal digandakan untuk kanal WhatsApp, cepat
 * atau lambat kedua salinan itu akan berbeda dan angka di web tidak lagi cocok
 * dengan angka yang dilaporkan bot.
 *
 * Aksi yang MENGUBAH atau MENGHAPUS tidak dieksekusi di sini. Tool-nya
 * mengembalikan `requiresConfirmation`, dan agent yang meminta "Balas YA".
 */

export interface ToolContext {
  userId: string;
  phoneE164: string;
}

export interface ToolResult {
  /** Teks yang dikembalikan ke model sebagai hasil tool. */
  content: string;
  /** Terisi kalau aksinya destruktif dan perlu konfirmasi manusia. */
  pending?: {
    actionType: "delete_transaction" | "update_transaction" | "delete_cash_entry";
    payload: Record<string, unknown>;
    summary: string;
  };
}

/** Tanggal hari ini menurut WIB — agent perlu ini untuk memahami "kemarin". */
export function todayInJakarta(): string {
  return dayKey(new Date().toISOString());
}

function parsePeriod(input?: string): Period {
  if (!input || input === "semua") return allPeriod();
  // "2026-07"
  const match = /^(\d{4})-(\d{2})$/.exec(input);
  if (match) return monthPeriod(Number(match[1]), Number(match[2]));
  const [y, m] = todayInJakarta().split("-");
  return monthPeriod(Number(y), Number(m));
}

// ---------------------------------------------------------------------------
// Definisi tool untuk model
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "catat_pengeluaran_tunai",
      description:
        "Mencatat pengeluaran uang tunai (uang fisik dari dompet). Pakai ini untuk 'beli kopi 25rb', 'makan siang 30 ribu', 'bayar parkir'.",
      parameters: {
        type: "object",
        properties: {
          nominal: { type: "integer", description: "Rupiah penuh, mis. 25000" },
          keterangan: { type: "string", description: "Dipakai untuk apa" },
          kategori: {
            type: "string",
            description: "Nama kategori pengeluaran. Kosongkan kalau tidak yakin.",
          },
          tanggal: {
            type: "string",
            description: "YYYY-MM-DD. Kosongkan berarti hari ini.",
          },
        },
        required: ["nominal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "catat_transaksi",
      description:
        "Mencatat transaksi rekening/e-wallet (bukan uang tunai fisik). Pakai untuk transfer, QRIS, atau pemasukan seperti gaji.",
      parameters: {
        type: "object",
        properties: {
          arah: {
            type: "string",
            enum: ["masuk", "keluar"],
            description: "masuk = pemasukan, keluar = pengeluaran",
          },
          nominal: { type: "integer" },
          pihak: { type: "string", description: "Nama penerima atau pengirim" },
          kategori: { type: "string" },
          tanggal: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["arah", "nominal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cari_transaksi",
      description:
        "Mencari transaksi. WAJIB dipanggil lebih dulu sebelum mengubah atau menghapus, untuk mendapatkan id-nya. Jangan pernah mengarang id.",
      parameters: {
        type: "object",
        properties: {
          kata_kunci: { type: "string", description: "Cocokkan nama pihak/keterangan" },
          periode: {
            type: "string",
            description: "'YYYY-MM' untuk satu bulan, atau 'semua'. Kosong = bulan ini.",
          },
          batas: { type: "integer", description: "Jumlah maksimal hasil, default 10" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ringkasan_periode",
      description:
        "Ringkasan pemasukan, pengeluaran, dan selisih untuk satu periode. Pakai untuk 'berapa pengeluaran bulan ini'.",
      parameters: {
        type: "object",
        properties: {
          periode: {
            type: "string",
            description: "'YYYY-MM' atau 'semua'. Kosong = bulan ini.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "saldo_dompet_tunai",
      description: "Saldo uang tunai saat ini beserta rinciannya.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "hapus_transaksi",
      description:
        "Menghapus sebuah transaksi. TIDAK langsung dieksekusi — akan meminta konfirmasi user lebih dulu.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id dari hasil cari_transaksi" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ubah_transaksi",
      description:
        "Mengubah nominal atau kategori sebuah transaksi. TIDAK langsung dieksekusi — akan meminta konfirmasi user lebih dulu.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id dari hasil cari_transaksi" },
          nominal: { type: "integer" },
          kategori: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Eksekusi
// ---------------------------------------------------------------------------

async function resolveCategory(
  userId: string,
  name: string | undefined,
  kind: "expense" | "income",
): Promise<string | null> {
  if (!name) return null;
  const categories = await repo.listCategories(userId);
  const target = name.toLowerCase().trim();
  const hit = categories.find(
    (c) => c.kind === kind && c.isActive && c.name.toLowerCase() === target,
  );
  // Pencocokan longgar hanya kalau yang persis tidak ada — mengarang kategori
  // baru dari chat akan merusak konsistensi laporan antar bulan.
  return (
    hit?.id ??
    categories.find(
      (c) =>
        c.kind === kind && c.isActive && c.name.toLowerCase().includes(target),
    )?.id ??
    null
  );
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { userId } = ctx;

  switch (name) {
    case "catat_pengeluaran_tunai": {
      const amount = Number(args.nominal);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { content: "Gagal: nominal harus lebih dari nol." };
      }
      const categoryId = await resolveCategory(
        userId,
        args.kategori as string | undefined,
        "expense",
      );
      const occurredAt = args.tanggal
        ? fromDateInputValue(String(args.tanggal))
        : new Date().toISOString();

      await repo.insertCashEntry(userId, {
        entryType: "manual_expense_debit",
        amount,
        transactionId: null,
        categoryId,
        note: (args.keterangan as string | undefined) ?? null,
        occurredAt,
        origin: "manual_wa",
      });

      const balance = computeCashBalance(await repo.listCashEntries(userId));
      return {
        content: `Tercatat: pengeluaran tunai ${formatIDR(amount)}${
          args.keterangan ? ` (${args.keterangan})` : ""
        }. Sisa saldo tunai ${formatIDR(balance)}.`,
      };
    }

    case "catat_transaksi": {
      const amount = Number(args.nominal);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { content: "Gagal: nominal harus lebih dari nol." };
      }
      const direction = args.arah === "masuk" ? "in" : "out";
      const categoryId = await resolveCategory(
        userId,
        args.kategori as string | undefined,
        direction === "in" ? "income" : "expense",
      );

      await repo.insertTransaction(userId, {
        source: "manual_other",
        direction,
        amount,
        occurredAt: args.tanggal
          ? fromDateInputValue(String(args.tanggal))
          : new Date().toISOString(),
        counterpartyName: (args.pihak as string | undefined) ?? null,
        counterpartyAccountNumber: null,
        rawTransactionType: "INPUT WHATSAPP",
        origin: "manual_wa",
        gmailMessageId: null,
        rawEmailSnippet: null,
        extractionConfidence: "high",
        categoryId,
        isInternalTransfer: false,
        internalTransferMatchType: null,
        needsReview: false,
        reviewReason: null,
      });

      return {
        content: `Tercatat: ${direction === "in" ? "pemasukan" : "pengeluaran"} ${formatIDR(amount)}${
          args.pihak ? ` — ${args.pihak}` : ""
        }.`,
      };
    }

    case "cari_transaksi": {
      const period = parsePeriod(args.periode as string | undefined);
      const keyword = String(args.kata_kunci ?? "").toLowerCase();
      const limit = Number(args.batas) || 10;

      const rows = (await repo.listTransactions(userId))
        .filter((t) => {
          if (period.mode !== "all") {
            const day = dayKey(t.occurredAt);
            if (day < period.startDay! || day > period.endDay!) return false;
          }
          if (!keyword) return true;
          return (t.counterpartyName ?? "").toLowerCase().includes(keyword);
        })
        .slice(0, limit);

      if (rows.length === 0) return { content: "Tidak ada transaksi yang cocok." };

      return {
        content: rows
          .map(
            (t) =>
              `id=${t.id} | ${formatDate(t.occurredAt)} | ${
                t.direction === "in" ? "masuk" : "keluar"
              } ${formatIDR(t.amount)} | ${t.counterpartyName ?? "-"}`,
          )
          .join("\n"),
      };
    }

    case "ringkasan_periode": {
      const period = parsePeriod(args.periode as string | undefined);
      const s = summarizePeriod(await repo.listTransactions(userId), period);
      return {
        content: [
          `Periode: ${period.label}`,
          `Pemasukan: ${formatIDR(s.income)}`,
          `Pengeluaran: ${formatIDR(s.expense)}`,
          `Selisih: ${formatIDR(s.net)}`,
          `Transfer internal (tidak dihitung): ${formatIDR(s.internalTransferTotal)}`,
        ].join("\n"),
      };
    }

    case "saldo_dompet_tunai": {
      const entries = await repo.listCashEntries(userId);
      const balance = computeCashBalance(entries);
      const withdrawn = entries
        .filter((e) => e.entryType !== "manual_expense_debit")
        .reduce((s, e) => s + e.amount, 0);
      const spent = entries
        .filter((e) => e.entryType === "manual_expense_debit")
        .reduce((s, e) => s + e.amount, 0);
      return {
        content: `Saldo tunai: ${formatIDR(balance)} (masuk ${formatIDR(withdrawn)}, terpakai ${formatIDR(spent)}).`,
      };
    }

    // --- Aksi destruktif: TIDAK dieksekusi di sini --------------------------

    case "hapus_transaksi": {
      const id = String(args.id ?? "");
      const target = (await repo.listTransactions(userId)).find(
        (t) => t.id === id,
      );
      // Pemeriksaan ini juga yang menahan id milik user lain: listTransactions
      // sudah tersaring per user, jadi id asing tidak akan pernah ketemu.
      if (!target) return { content: "Transaksi tidak ditemukan." };

      const summary = `${formatDate(target.occurredAt)} · ${
        target.counterpartyName ?? "tanpa keterangan"
      } · ${formatIDR(target.amount)}`;

      return {
        content: `Menunggu konfirmasi user untuk menghapus: ${summary}`,
        pending: {
          actionType: "delete_transaction",
          payload: { id },
          summary: `Hapus transaksi ${summary}?`,
        },
      };
    }

    case "ubah_transaksi": {
      const id = String(args.id ?? "");
      const target = (await repo.listTransactions(userId)).find(
        (t) => t.id === id,
      );
      if (!target) return { content: "Transaksi tidak ditemukan." };

      const patch: Record<string, unknown> = {};
      const changes: string[] = [];

      if (args.nominal !== undefined) {
        const amount = Number(args.nominal);
        if (Number.isFinite(amount) && amount > 0) {
          patch.amount = amount;
          changes.push(`nominal ${formatIDR(target.amount)} → ${formatIDR(amount)}`);
        }
      }
      if (args.kategori !== undefined) {
        const categoryId = await resolveCategory(
          userId,
          args.kategori as string,
          target.direction === "in" ? "income" : "expense",
        );
        if (categoryId) {
          patch.categoryId = categoryId;
          changes.push(`kategori → ${args.kategori}`);
        }
      }

      if (changes.length === 0) {
        return { content: "Tidak ada perubahan yang bisa diterapkan." };
      }

      const summary = `${target.counterpartyName ?? "transaksi"} (${changes.join(", ")})`;
      return {
        content: `Menunggu konfirmasi user untuk mengubah: ${summary}`,
        pending: {
          actionType: "update_transaction",
          payload: { id, patch },
          summary: `Ubah ${summary}?`,
        },
      };
    }

    default:
      return { content: `Tool tidak dikenal: ${name}` };
  }
}

/**
 * Menjalankan aksi yang sudah dikonfirmasi user.
 *
 * Terpisah dari `executeTool` dengan sengaja: jalur ini hanya bisa dicapai
 * lewat balasan "YA" atas konfirmasi yang tercatat di database — bukan lewat
 * keputusan model.
 */
export async function executeConfirmedAction(
  userId: string,
  actionType: string,
  payload: Record<string, unknown>,
): Promise<string> {
  switch (actionType) {
    case "delete_transaction":
      await repo.deleteTransaction(userId, String(payload.id));
      return "Transaksi dihapus.";

    case "update_transaction":
      await repo.updateTransaction(
        userId,
        String(payload.id),
        payload.patch as Record<string, never>,
      );
      return "Transaksi diperbarui.";

    case "delete_cash_entry":
      await repo.deleteCashEntry(userId, String(payload.id));
      return "Catatan tunai dihapus.";

    default:
      return "Aksi tidak dikenal, tidak ada yang diubah.";
  }
}

export { findSystemCategory };
