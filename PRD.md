# PRD — Financial Tracker

## 1. Latar Belakang & Masalah

Transaksi keuangan sehari-hari (Anda & istri) tersebar di banyak rekening bank dan e-wallet. Pencatatan manual di aplikasi finance biasa tidak mencerminkan kondisi nyata karena:
- Transfer antar rekening milik sendiri (Anda ↔ istri, lintas bank) ikut tercatat sebagai pengeluaran/pemasukan, padahal itu cuma perpindahan uang milik sendiri.
- Tarik tunai tercatat sebagai satu pengeluaran besar, padahal uangnya dipakai untuk banyak hal kecil yang baru diketahui detailnya belakangan (tidak real-time).

## 2. Tujuan Produk

Membangun aplikasi financial tracking yang **otomatis** menangkap transaksi dari email notifikasi bank/e-wallet, dengan dua aturan domain khusus:
1. Transfer antar rekening sendiri (Anda/istri) **tidak dihitung** sebagai pengeluaran/pemasukan.
2. Tarik tunai menjadi saldo **"cash wallet"** yang dikurangi oleh input manual pengeluaran cash, sehingga bisa di-cross-check apakah uang tunai yang ditarik sudah sesuai dengan yang dibelanjakan.

## 3. Target Pengguna

- **Primary user:** Anda (single login web app, via Google OAuth).
- **Secondary channel:** Istri — tidak punya login web, tapi bisa mencatat/mengelola transaksi via WhatsApp bot (nomor di-whitelist).

## 4. Ruang Lingkup Fungsional

### 4.1 Ingestion Email
- Sumber: email notifikasi transaksi dari BCA, Blu BCA, SeaBank, ShopeePay, OVO, Dana, GoPay.
- Mekanisme: forward otomatis dari Gmail utama ke Gmail khusus (dedicated inbox) → aplikasi polling inbox itu tiap 10-15 menit via Gmail API.
- **Catatan risiko:** e-wallet (ShopeePay/OVO/Dana/GoPay) kemungkinan tidak mengirim email transaksi (notifikasi push-only) — perlu divalidasi di awal implementasi. Sumber yang tidak mengirim email akan di-fallback ke input manual.
- Tidak ada backfill histori — pencatatan mulai dari transaksi baru sejak aplikasi aktif.

### 4.2 Ekstraksi & Kategorisasi
- Parsing email menggunakan LLM (via OpenRouter), bukan regex per-bank — menghasilkan data terstruktur: jumlah, arah (masuk/keluar), nama & nomor rekening lawan transaksi, waktu, jenis transaksi.
- Kategorisasi otomatis oleh LLM dari daftar kategori tetap (bisa diedit user):
  - **Pengeluaran:** Makanan & Minuman, Transport, Belanja, Tagihan & Utilitas, Hiburan, Kesehatan, Pendidikan, Cash Expense (khusus tarik tunai, otomatis), Lainnya
  - **Pemasukan:** Gaji, Transfer Masuk, Refund, Lainnya
- Transaksi/ekstraksi dengan confidence rendah tetap masuk ke ledger, tapi ditandai "perlu direview" (passive queue, tidak memblokir apa pun).

### 4.3 Deteksi Transfer Internal
- Whitelist nomor rekening (milik Anda & istri, semua bank) sebagai sumber kebenaran utama.
- Fallback fuzzy-name-matching kalau nomor rekening tidak muncul di email (umum untuk notifikasi yang menyamarkan nomor) — hasil fallback ditandai "perlu direview".
- Transaksi yang cocok (baik via nomor rekening maupun fuzzy name) dikecualikan dari total pengeluaran/pemasukan.

### 4.4 Cash Wallet
- Tarik tunai otomatis menambah saldo "cash wallet" (model running balance, bukan per-transaksi/batch).
- User input manual pengeluaran cash (jumlah, kategori, catatan, tanggal) via web app atau WhatsApp — mengurangi saldo cash wallet.
- Saldo cash wallet ditampilkan di dashboard; kalau negatif, tampil alert informatif (tidak memblokir).

### 4.5 Web App
- Login: Google OAuth, dibatasi hanya untuk 1 akun (Anda).
- Halaman: daftar transaksi (dengan badge review), manajemen whitelist rekening sendiri, manajemen kategori, halaman cash wallet + input manual, dashboard ringkasan.
- Responsive (bisa diakses dari HP), berpotensi PWA di masa depan.

### 4.6 WhatsApp Bot
- Self-hosted WAHA, terhubung ke nomor cadangan (bukan nomor pribadi Anda/istri).
- Whitelist: hanya nomor Anda & istri yang perintahnya diproses; nomor lain diabaikan sepenuhnya.
- Full CRUD via natural language: catat transaksi/pengeluaran cash, edit, hapus, query laporan ("berapa pengeluaran bulan ini?").
- Aksi destruktif (hapus/edit) wajib konfirmasi eksplisit ("Balas YA") sebelum dieksekusi; create & query langsung dieksekusi.
- Notifikasi keluar (misal saldo cash wallet negatif) dikirim ke kedua nomor via WhatsApp.
- Implementasi: agent LLM (OpenRouter) dengan tool-calling ke MCP-style internal tool server, dipakai khusus untuk WA di v1 (tidak perlu diekspos ke luar seperti Claude Desktop).

## 5. Non-Functional Requirements

- **Hosting:** Cloud VPS milik user (sudah ada), deployment single-process (pm2/systemd), tidak serverless.
- **Stack:** Next.js (TypeScript) + PostgreSQL + Drizzle ORM.
- **Keamanan:** Kredensial Gmail (refresh token), API key OpenRouter, session WAHA, semua disimpan di luar git (env file di VPS, bukan di database/kode). Email inbox terpisah dari email pribadi supaya blast radius kecil kalau ada masalah.
- **Auditability:** Setiap transaksi menyimpan raw email snippet & raw LLM response untuk keperluan debug/reprocessing.

## 6. Di Luar Ruang Lingkup (v1)

- Multi-user login penuh (istri tidak dapat akun web sendiri di v1 — hanya via WhatsApp).
- Real-time push notification email (pakai polling berkala, bukan Gmail Pub/Sub).
- Backfill histori transaksi lama.
- Budgeting/alert per kategori (belum diminta).
- Multi-currency (asumsi IDR saja).
- Akses eksternal MCP server (misal dari Claude Desktop) — arsitektur mendukung, tapi tidak diimplementasi di v1.

## 7. Roadmap Bertahap

| Fase | Fokus | Output |
|---|---|---|
| **Fase 1** | Fondasi ingestion | Email → LLM extraction → tersimpan di Postgres; web app dasar (login + daftar transaksi mentah) |
| **Fase 2** | Logika inti | Deteksi transfer internal, cash wallet, kategorisasi otomatis, review queue, halaman manajemen |
| **Fase 3** | WhatsApp | WAHA + bot CRUD full + notifikasi |

## 8. Kriteria Sukses

- Semua transaksi bank (BCA/Blu BCA/SeaBank) yang masuk email ter-capture otomatis dalam 15 menit, tanpa data hilang/duplikat (validasi soak-test 24-48 jam).
- Transfer antar rekening sendiri tidak pernah muncul di total pengeluaran/pemasukan (0 false negative pada whitelist match).
- Saldo cash wallet mencerminkan selisih riil antara tarik tunai dan pengeluaran cash yang dicatat manual.
- Bot WhatsApp menolak 100% perintah dari nomor di luar whitelist, dan tidak pernah mengeksekusi hapus/edit tanpa konfirmasi eksplisit.

## Referensi Teknis

Rencana implementasi teknis detail (skema database, struktur modul, per-fase build plan, verifikasi) ada di: `C:\Users\FAJAR\.claude\plans\nifty-sauteeing-dewdrop.md`
