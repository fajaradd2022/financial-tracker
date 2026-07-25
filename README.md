# Financial Tracker

Pencatatan keuangan otomatis dari email notifikasi bank & e-wallet, dengan dua
aturan khusus: transfer antar rekening milik sendiri (suami/istri) tidak dihitung
sebagai pengeluaran, dan tarik tunai menjadi saldo "dompet tunai" yang dikurangi
oleh catatan pengeluaran tunai manual.

Kebutuhan produk lengkap ada di [PRD.md](PRD.md).

## Status saat ini

| Bagian | Status |
|---|---|
| Autentikasi (Better Auth + SQLite) | **Berfungsi sungguhan** — login, sesi, peran, manajemen pengguna |
| Data keuangan | **Dummy** di `localStorage` browser |
| Ingestion Gmail, ekstraksi LLM, bot WhatsApp | Belum dibangun (Fase 1–3 di PRD) |

Tombol **Reset data demo** di Pengaturan hanya mengembalikan data keuangan dummy;
akun login tidak terpengaruh.

## Menjalankan

```bash
npm install
npm run auth:setup   # buat tabel auth + akun admin pertama (sekali saja)
npm run dev
```

Buka http://localhost:3000 — akan diarahkan ke `/login`.

Akun awal dari `auth:setup` (ganti passwordnya setelah login):

```
email    : itopscitius@gmail.com
password : financial123
```

Bisa ditimpa lewat env: `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME`.

```bash
npm run build      # build produksi
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

### Env untuk produksi

```
BETTER_AUTH_SECRET=<string acak minimal 32 karakter>
BETTER_AUTH_URL=https://domain-anda
```

`BETTER_AUTH_SECRET` wajib diisi di VPS. Tanpa itu dipakai fallback pengembangan,
dan semua sesi jadi invalid begitu nilainya berubah. Database SQLite ada di
`data/auth.db` (sudah masuk `.gitignore`).

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
    (dashboard)/        # area terautentikasi — layout-nya yang memverifikasi sesi
    api/auth/[...all]/  # handler Better Auth
    login/
  components/           # AppShell, PeriodPicker, Pagination, form, chart, primitif UI
  lib/
    auth.ts             # konfigurasi Better Auth (server)
    auth-client.ts      # client Better Auth + plugin admin
    types.ts            # tipe domain — mengikuti rencana skema Drizzle
    dummy-data.ts       # data contoh (tanggal eksplisit, acuan 26 Juli 2026)
    store.tsx           # store demo (useSyncExternalStore + localStorage)
    preferences.ts      # tema & sensor nominal + skrip pra-hydration
    period.ts           # model periode (bulan/tahun/rentang/semua)
    format.ts           # format Rupiah & tanggal, dikunci ke Asia/Jakarta
    export-excel.ts     # export .xlsx
scripts/setup-auth.ts   # migrasi skema auth + seed akun admin
```

Beberapa keputusan yang sengaja diambil:

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
Better Auth (SQLite) · write-excel-file
