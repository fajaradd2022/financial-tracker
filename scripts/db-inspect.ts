/**
 * Utilitas cepat untuk melihat isi database. Jalankan: `npm run db:inspect`
 *
 * Dibungkus fungsi async (bukan top-level await) karena package.json tidak
 * memakai "type": "module", sehingga skrip ditranspilasi ke CommonJS.
 */
import { createDb } from "../src/db/connection";
import {
  cashWalletEntries,
  categories,
  ingestionConfig,
  ownAccounts,
  sourceHealth,
  transactions,
  whatsappNumbers,
} from "../src/db/schema";

async function main() {
  const db = createDb();

  const tables = {
    categories,
    own_accounts: ownAccounts,
    transactions,
    cash_wallet_entries: cashWalletEntries,
    whatsapp_numbers: whatsappNumbers,
    source_health: sourceHealth,
  };

  console.log("Jumlah baris per tabel:");
  for (const [name, table] of Object.entries(tables)) {
    const rows = await db.select().from(table);
    console.log(`  ${name.padEnd(22)} ${rows.length}`);
  }

  const [config] = await db.select().from(ingestionConfig);
  console.log("\nKonfigurasi ingestion:", config);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
