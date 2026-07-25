# Financial Tracker

Pencatatan keuangan otomatis dari email notifikasi bank & e-wallet, dengan dua
aturan khusus: transfer antar rekening milik sendiri (suami/istri) tidak dihitung
sebagai pengeluaran, dan tarik tunai menjadi saldo "dompet tunai" yang dikurangi
oleh catatan pengeluaran tunai manual.

Kebutuhan produk lengkap ada di [PRD.md](PRD.md).

## Status saat ini

| Bagian | Status |
|---|---|
| Database (SQLite + Drizzle) | **Berfungsi** — skema, migrasi, seed, repository |
| Autentikasi (Better Auth) | **Berfungsi** — login, sesi, peran, manajemen pengguna |
| Web app (semua halaman) | **Berfungsi** — baca & tulis ke database sungguhan |
| Pipeline ingestion (Gmail → LLM → transaksi) | **Kode lengkap & teruji**, menunggu kredensial |
| Bot WhatsApp | Belum dibangun (Fase 3 di PRD) |

Pipeline ingestion sudah diuji end-to-end dengan email contoh dan LLM tiruan
(`npm run test:pipeline`, 19 pemeriksaan). Yang belum bisa dijalankan hanyalah
penarikan email sungguhan, karena butuh kredensial Gmail & OpenRouter.

## Menjalankan

```bash
npm install
cp .env.example .env   # isi seperlunya; untuk mencoba lokal boleh dibiarkan kosong
npm run db:setup       # migrasi + seed + akun admin pertama (aman diulang)
npm run dev
```

Buka http://localhost:3000 — akan diarahkan ke `/login`.

Akun awal dari `db:setup` (ganti passwordnya setelah login):

```
email    : itopscitius@gmail.com
password : financial123
```

Bisa ditimpa lewat env: `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME`.

## Perintah

```bash
npm run dev            # server pengembangan
npm run build          # build produksi
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run db:setup       # migrasi + seed + akun admin (idempoten)
npm run db:generate    # buat berkas migrasi baru setelah skema berubah
npm run db:inspect     # lihat jumlah baris tiap tabel
npm run db:studio      # Drizzle Studio (penjelajah database)
npm run poll           # jalankan satu putaran penarikan email secara manual
npm run test:pipeline  # uji pipeline ingestion dengan email contoh + LLM tiruan
```

## Mengaktifkan ingestion email

1. **Buat inbox khusus.** Gmail terpisah untuk menampung forward notifikasi bank.
   Inbox pribadi tidak pernah diakses aplikasi.
2. **Atur forwarding** di Gmail utama: filter berdasarkan pengirim bank →
   teruskan ke inbox khusus (perlu verifikasi alamat sekali di Gmail).
3. **Google Cloud Console:** aktifkan Gmail API, buat OAuth client, jalankan alur
   consent satu kali sebagai akun inbox khusus untuk mendapat refresh token.
   Scope cukup `gmail.readonly`.
4. **Isi `.env`:** `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`,
   `OPENROUTER_API_KEY`, `OWNER_ACCOUNT_NAMES`.
5. **Nyalakan** di Pengaturan → Umum & Ingestion (default: dimatikan).
6. **Uji:** `npm run poll`, lalu cek halaman Transaksi.

Penjadwal berjalan di dalam proses aplikasi (`src/instrumentation.ts`) dengan
interval yang diatur di halaman Pengaturan. Tersedia juga pemicu manual
`POST /api/cron/poll-gmail` dengan header `x-cron-secret` sebagai cadangan.

> **Risiko yang masih terbuka:** daftar alamat pengirim di
> `src/lib/gmail/source-mapping.ts` masih tebakan berdasarkan domain resmi dan
> belum diverifikasi dengan email sungguhan. Langkah pertama setelah forwarding
> aktif adalah memeriksa alamat pengirim yang benar-benar dipakai tiap bank —
> terutama e-wallet, yang mungkin tidak mengirim email transaksi sama sekali.

### Env untuk produksi

```
BETTER_AUTH_SECRET=<string acak minimal 32 karakter>
BETTER_AUTH_URL=https://domain-anda
```

`BETTER_AUTH_SECRET` wajib diisi di VPS. Tanpa itu dipakai fallback pengembangan,
dan semua sesi jadi invalid begitu nilainya berubah. Database ada di
`data/app.db` (sudah masuk `.gitignore`) — backup cukup menyalin berkas itu.

Jalankan pm2 dalam mode **fork dengan satu instance**. Mode cluster akan
menjalankan penjadwal polling di setiap worker, sehingga inbox ditarik
berkali-kali bersamaan.

## Halaman

| Rute | Isi |
|---|---|
| `/login` | Login email + password (tidak ada pendaftaran mandiri) |
| `/dashboard` | Ringkasan periode, 5 transaksi terakhir, chart pemasukan & pengeluaran per kategori, rekonsiliasi tunai |
| `/transactions` | Daftar + filter + pencarian, tambah transaksi, export Excel, paginasi |
| `/transactions/[id]` | Detail, koreksi data, ubah kategori/status internal, hapus |
| `/cash` | Saldo dompet tunai, riwayat, tambah transaksi tunai (masuk/keluar), export Excel |
| `/settings` | Konfigurasi ingestion email (bisa diubah), status sumber, whitelist WhatsApp |
| `/settings/accounts` | Whitelist rekening & e-wallet milik sendiri |
| `/settings/categories` | Kelola daftar kategori tetap |
| `/settings/users` | Manajemen pengguna: tambah, ubah peran, nonaktifkan, hapus |

## Struktur

```
src/
  app/
    (dashboard)/          # area terautentikasi — layout: cek sesi + ambil data
    api/auth/[...all]/    # handler Better Auth
    api/cron/poll-gmail/  # pemicu polling manual (shared secret)
    actions.ts            # server action untuk seluruh mutasi
    login/
  components/             # AppShell, PeriodPicker, Pagination, form, chart, UI
  db/
    schema.ts             # skema Drizzle (SQLite)
    connection.ts         # koneksi bersama (web app + skrip CLI)
    repositories.ts       # satu-satunya tempat kueri ditulis
    seed-data.ts          # kategori & konfigurasi awal
  lib/
    auth.ts               # konfigurasi Better Auth (server)
    auth-client.ts        # client Better Auth + plugin admin
    types.ts              # tipe domain
    store.tsx             # context: data dari server + pemanggil server action
    domain/               # aturan produk: transfer internal, dompet tunai
    llm/                  # OpenRouter, prompt & skema ekstraksi, kategorisasi
    gmail/                # klien Gmail API, pemetaan pengirim → sumber
    ingestion/            # pipeline email → transaksi, job polling
    preferences.ts        # tema & sensor nominal + skrip pra-hydration
    period.ts             # model periode (bulan/tahun/rentang/semua)
    format.ts             # format Rupiah & tanggal, dikunci ke Asia/Jakarta
    export-excel.ts       # export .xlsx
  instrumentation.ts      # penjadwal polling in-process
drizzle/                  # berkas migrasi hasil generate
scripts/                  # db-setup, db-inspect, poll-gmail, test-pipeline
```

Beberapa keputusan yang sengaja diambil:

- **Email yang gagal diekstrak tetap disimpan** sebagai transaksi ber-confidence
  rendah dan ditandai perlu direview, bukan dibuang. Transaksi yang tercatat
  salah masih bisa dilihat dan dikoreksi; transaksi yang tidak pernah muncul
  tidak akan pernah disadari hilang.
- **Kursor polling baru dimajukan setelah seluruh batch selesai.** Kalau proses
  mati di tengah, jendela yang sama ditarik ulang. Memproses ulang aman (ditangkis
  unique constraint `gmail_message_id`); melewatkan email tidak.
- **Nomor rekening mengalahkan nama.** Kalau nomor rekening ada di email tapi
  bukan milik sendiri, pencocokan berhenti di situ — nama yang kebetulan mirip
  tidak boleh menganulir nomor rekening yang jelas berbeda.
- **Tarik tunai dikategorikan di kode, bukan lewat LLM.** Itu aturan tetap;
  memanggil model hanya menambah biaya dan peluang salah.
- **Waktu disimpan sebagai string ISO, nominal sebagai integer rupiah.** ISO bisa
  dibaca langsung saat men-debug isi tabel; integer membebaskan penjumlahan dari
  galat pembulatan float.
- **Sensor nominal & tema dikerjakan CSS + skrip pra-hydration**, bukan state
  React. Untuk sensor nominal ini bukan sekadar anti-kedip: kalau status
  "disembunyikan" baru diterapkan setelah hydration, angka aslinya sempat
  terlihat satu frame. Skripnya wajib tinggal di modul netral
  (`lib/preferences.ts`) — kalau diekspor dari modul `"use client"`, root layout
  yang server component menerima *client reference*, bukan string, dan yang
  tertulis ke HTML jadi skrip rusak.
- **Sesi diverifikasi di layout server, bukan middleware/proxy.** Middleware hanya
  bisa melihat cookie (pengecekan optimistis); di layout sesinya benar-benar
  dicek ke database, jadi tidak ada halaman yang lolos hanya karena cookie ada.
- **Daftar pengguna diambil di server component**, mutasinya di client lalu
  `router.refresh()` — tidak ada fetch-on-mount, jadi hak akses tersaring sebelum
  data pernah sampai ke browser.
- **Batas periode disimpan sebagai string `YYYY-MM-DD` WIB**, bukan `Date`.
  Perbandingannya jadi perbandingan string yang selalu benar, tanpa aritmatika
  zona waktu yang gampang meleset sehari di sekitar tengah malam.
- **Saldo dompet tunai dihitung `SUM` dari ledger**, bukan disimpan sebagai angka
  berjalan — edit/hapus catatan otomatis benar tanpa koreksi manual.
- **Halaman aktif paginasi diturunkan lewat `Math.min`**, bukan dikoreksi lewat
  efek — saat filter menyusutkan data, langsung mendarat di halaman terakhir yang
  valid tanpa render kosong sekejap.
- **Nominal diekspor sebagai angka**, bukan teks "Rp1.500.000", supaya kolomnya
  bisa langsung di-SUM di Excel.
- **Warna chart hanya penguat.** Setiap bar dilabeli nominal dan nama kategori,
  karena hijau/merah tidak terbedakan pada buta warna merah-hijau.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite + Drizzle ORM · Better Auth · OpenRouter · write-excel-file
