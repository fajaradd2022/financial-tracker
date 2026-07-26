# Financial Tracker

Pencatatan keuangan otomatis dari email notifikasi bank & e-wallet, multi-user,
dengan fitur kolaborasi antar pengguna dan bot WhatsApp.

Kebutuhan produk lengkap ada di [PRD.md](PRD.md).

---

## Daftar isi

**Mulai cepat**
- [Status saat ini](#status-saat-ini)
- [Menjalankan di komputer sendiri](#menjalankan-di-komputer-sendiri)
- [Perintah](#perintah)

**Menuju produksi**
- [Ringkasan seluruh kredensial](#ringkasan-seluruh-kredensial)
- [1 · Kunci acak (dibuat sendiri)](#1--kunci-acak-dibuat-sendiri)
- [2 · Google Cloud — Gmail API](#2--google-cloud--gmail-api)
- [3 · OpenRouter — LLM](#3--openrouter--llm)
- [4 · WAHA — WhatsApp](#4--waha--whatsapp)
- [5 · Inbox khusus + forwarding](#5--inbox-khusus--forwarding)
- [Deploy ke Coolify](#deploy-ke-coolify)
- [Deploy dengan Docker Compose (VPS manual)](#deploy-dengan-docker-compose-vps-manual)
- [Setelah deploy: urutan langkah pertama](#setelah-deploy-urutan-langkah-pertama)
- [Backup & restore](#backup--restore)
- [Update ke versi baru](#update-ke-versi-baru)
- [Kalau bermasalah](#kalau-bermasalah)

**Cara kerja produk**
- [Model multi-tenant](#model-multi-tenant)
- [Kolaborasi](#kolaborasi)
- [Dashboard admin](#dashboard-admin)
- [Bot WhatsApp](#bot-whatsapp)
- [Halaman](#halaman)
- [Struktur & keputusan desain](#struktur--keputusan-desain)

---

## Status saat ini

| Bagian | Status |
|---|---|
| Database (SQLite + Drizzle) | **Berfungsi** — skema, migrasi, seed, repository |
| Autentikasi (Better Auth) | **Berfungsi** — login, sesi, peran, manajemen pengguna |
| Multi-tenant | **Berfungsi** — data terisolasi penuh per user |
| Web app (semua halaman) | **Berfungsi** — baca & tulis ke database sungguhan |
| Kolaborasi antar user | **Berfungsi** — undangan, kantong bersaldo, report |
| Pipeline ingestion (Gmail → LLM → transaksi) | **Kode lengkap & teruji**, menunggu kredensial |
| Dashboard admin operasional | **Berfungsi** — status ingestion per akun, reset password |
| Gmail per-user (OAuth in-app) | **Berfungsi** — token terenkripsi per akun |
| Bot WhatsApp (WAHA) | **Berfungsi** — CRUD bahasa alami + konfirmasi + notifikasi |
| Image Docker produksi | **Ada** — `Dockerfile` + `docker-compose.yml` |

Diuji otomatis lewat `npm test` — **122 pemeriksaan**:

| Perintah | Isi | Jumlah |
|---|---|---|
| `test:tenancy` | isolasi antar user (baca, tulis, hapus akun) | 21 |
| `test:pipeline` | pipeline ingestion dengan email contoh & LLM tiruan | 19 |
| `test:collaboration` | kolaborasi (anti dobel, kantong, privasi) | 43 |
| `test:gmail` | enkripsi token & isolasi cache access token | 17 |
| `test:whatsapp` | agent (konfirmasi, routing nomor, tool) | 22 |

Yang belum bisa dibuktikan otomatis hanyalah yang menyentuh layanan luar —
penarikan email sungguhan dan pengiriman pesan WhatsApp — karena butuh
kredensial Gmail, OpenRouter, dan instance WAHA yang hidup.

> **Catatan jujur soal Docker:** `Dockerfile` dan `docker-compose.yml` di repo ini
> disusun dan diverifikasi per tahap secara lokal (build produksi, `npm ci
> --omit=dev` di salinan bersih, migrasi tanpa TypeScript, `next start`, dan
> perintah healthcheck-nya) — tetapi **`docker build` sendiri belum pernah
> dijalankan**, karena Docker tidak terpasang di mesin pengembangan. Build
> pertama Anda adalah build pertama image ini.

---

## Menjalankan di komputer sendiri

Butuh **Node.js 22** (versi yang dipakai: 22.18.0).

```bash
npm install
cp .env.example .env   # boleh dibiarkan kosong untuk mencoba
npm run db:setup       # migrasi + seed + akun admin pertama (aman diulang)
npm run dev
```

Buka http://localhost:3000 — akan diarahkan ke `/login`.

Akun awal dari `db:setup` (**ganti passwordnya setelah login**):

```
email    : itopscitius@gmail.com
password : financial123
```

Bisa ditimpa lewat env: `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME`.

Dengan `.env` kosong pun aplikasi berjalan penuh — halaman, database, login,
pencatatan manual, kolaborasi, semuanya hidup. Yang mati hanya ingestion email
dan bot WhatsApp, dan alasannya ditampilkan di halaman Pengaturan.

## Perintah

```bash
npm run dev            # server pengembangan
npm run build          # build produksi
npm run start          # jalankan hasil build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run db:setup       # migrasi + seed + akun admin (idempoten)
npm run db:generate    # buat berkas migrasi baru setelah skema berubah
npm run db:inspect     # lihat jumlah baris tiap tabel
npm run db:studio      # Drizzle Studio (penjelajah database)
npm run poll           # jalankan satu putaran penarikan email secara manual
npm run gen:key        # buat ENCRYPTION_KEY baru
npm test               # seluruh uji otomatis (122 pemeriksaan)
```

---

# Menuju produksi

Bagian ini ditulis dengan asumsi Anda belum punya satu pun kredensial.

## Ringkasan seluruh kredensial

| Variabel | Wajib? | Dari mana | Kalau kosong |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | **Wajib** | dibuat sendiri | dipakai fallback pengembangan; semua sesi invalid saat nilainya berubah |
| `BETTER_AUTH_URL` | **Wajib** | domain Anda | **login gagal 403** |
| `ENCRYPTION_KEY` | **Wajib** | `npm run gen:key` | Gmail tidak bisa dihubungkan |
| `DATABASE_PATH` | otomatis | diisi compose | default `./data/app.db` |
| `GMAIL_CLIENT_ID` | untuk ingestion | Google Cloud Console | tombol "Hubungkan Gmail" mati |
| `GMAIL_CLIENT_SECRET` | untuk ingestion | Google Cloud Console | sama |
| `OPENROUTER_API_KEY` | untuk ingestion & bot | openrouter.ai | email tidak bisa diekstrak; bot tidak paham pesan |
| `OPENROUTER_MODEL` | opsional | openrouter.ai | default `google/gemini-2.5-flash` |
| `OWNER_ACCOUNT_NAMES` | opsional | nama Anda sendiri | deteksi transfer internal hanya lewat nomor rekening |
| `WAHA_BASE_URL` | untuk bot | alamat WAHA | bot mati |
| `WAHA_API_KEY` | untuk bot | dibuat sendiri | WAHA menolak panggilan |
| `WAHA_SESSION` | untuk bot | nama sesi WAHA | default `default` |
| `WAHA_WEBHOOK_SECRET` | untuk bot | dibuat sendiri | **webhook menolak semua pesan** |
| `CRON_SECRET` | opsional | dibuat sendiri | endpoint polling manual tertutup |
| `OWNER_EMAIL` / `OWNER_PASSWORD` / `OWNER_NAME` | opsional | pilihan Anda | dipakai default bawaan |

Tiga variabel pertama yang "wajib" adalah wajib **untuk produksi**. Aplikasi
tetap menyala tanpa mereka, tapi tidak layak dipakai sungguhan.

---

## 1 · Kunci acak (dibuat sendiri)

Empat nilai ini tidak diminta dari layanan mana pun — Anda yang membuatnya.
Buat sekali, lalu **simpan di tempat aman**.

```bash
# BETTER_AUTH_SECRET — penandatangan cookie sesi
openssl rand -base64 32

# WAHA_WEBHOOK_SECRET — rahasia bersama webhook WhatsApp
openssl rand -base64 32

# CRON_SECRET — pelindung endpoint polling manual
openssl rand -base64 32

# ENCRYPTION_KEY — AES-256-GCM untuk refresh token Gmail
npm run gen:key
```

Tanpa `openssl`, pakai Node — yang pasti ada karena aplikasi ini membutuhkannya:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> ### `ENCRYPTION_KEY` adalah satu-satunya kunci yang tidak boleh hilang
>
> Kunci ini mengenkripsi refresh token Gmail **di dalam database**. Backup
> database saja tidak cukup — kalau kuncinya hilang atau diganti, isi backup itu
> tidak bisa dibaca lagi dan **setiap user harus menghubungkan Gmail-nya ulang**.
>
> Simpan `ENCRYPTION_KEY` di tempat yang sama dengan arsip backup Anda, bukan
> hanya di panel Coolify. Panelnya bisa ikut hilang bersama servernya.
>
> Mengganti `BETTER_AUTH_SECRET` jauh lebih ringan akibatnya: semua orang cuma
> perlu login ulang.

---

## 2 · Google Cloud — Gmail API

Menghasilkan `GMAIL_CLIENT_ID` dan `GMAIL_CLIENT_SECRET`. **Gratis.**

Satu OAuth app untuk seluruh instalasi. Refresh token per-user tidak pernah
ditempel ke `.env` — tiap user menghubungkan Gmail-nya sendiri lewat tombol di
halaman Pengaturan, dan tokennya disimpan terenkripsi di database.

### Langkah

1. Buka [console.cloud.google.com](https://console.cloud.google.com) → **buat
   project baru** (misal `financial-tracker`).

2. **Aktifkan Gmail API**
   *APIs & Services → Library →* cari **Gmail API** → **Enable**.

3. **Isi OAuth consent screen**
   *APIs & Services → OAuth consent screen*
   - User Type: **External**
     (pilih **Internal** hanya kalau Anda punya Google Workspace dan semua user
     ada di organisasi yang sama — lihat kotak peringatan di bawah, jalur ini
     jauh lebih mulus)
   - App name, support email, developer contact: isi apa adanya
   - **Scopes** → *Add or remove scopes* → tambahkan dua ini:
     ```
     https://www.googleapis.com/auth/gmail.readonly
     https://www.googleapis.com/auth/userinfo.email
     ```
   - **Test users**: tambahkan alamat Gmail setiap orang yang akan memakai
     aplikasi ini

4. **Buat OAuth client ID**
   *APIs & Services → Credentials → Create Credentials → OAuth client ID*
   - Application type: **Web application**
   - **Authorized redirect URIs** — isi **persis**, termasuk `https://` dan
     tanpa garis miring di akhir:
     ```
     https://domain-anda.com/api/gmail/callback
     ```
     Tambahkan juga baris ini kalau Anda mau menguji dari laptop:
     ```
     http://localhost:3000/api/gmail/callback
     ```
   - Create → salin **Client ID** dan **Client secret**

5. Masukkan keduanya sebagai `GMAIL_CLIENT_ID` dan `GMAIL_CLIENT_SECRET`.

> ### Jebakan terbesar: status "Testing" membunuh koneksi tiap 7 hari
>
> Google memberikan refresh token yang **kedaluwarsa dalam 7 hari** untuk OAuth
> app External yang publishing status-nya masih **Testing**. Artinya ingestion
> Anda akan berhenti seminggu setelah deploy, dan semua orang harus
> menghubungkan Gmail-nya ulang — setiap minggu, selamanya.
>
> **Solusinya:** di *OAuth consent screen*, tekan **Publish app** sehingga
> statusnya menjadi **In production**. Refresh token berhenti kedaluwarsa.
>
> Karena `gmail.readonly` termasuk *restricted scope*, app yang belum
> diverifikasi Google akan menampilkan layar peringatan *"Google hasn't verified
> this app"* saat user menyetujui. Untuk pemakaian pribadi/keluarga ini bukan
> penghalang — tekan **Advanced → Go to (unsafe)** dan lanjutkan. Verifikasi
> penuh baru relevan kalau aplikasinya dibuka untuk publik luas.
>
> Aplikasi ini tidak gagal diam-diam saat token mati: halaman Pengaturan
> menandainya sebagai "koneksi bermasalah".

### Kalau ingestion tidak dipakai

Lewati saja seluruh bagian ini. Kosongkan `GMAIL_CLIENT_ID` dan
`GMAIL_CLIENT_SECRET`; pencatatan manual lewat web dan WhatsApp tetap jalan.

---

## 3 · OpenRouter — LLM

Menghasilkan `OPENROUTER_API_KEY`. **Berbayar, sangat murah.**

Dipakai dua tempat: mengekstrak isi email bank menjadi transaksi terstruktur,
dan memahami perintah bahasa alami di bot WhatsApp.

1. Daftar di [openrouter.ai](https://openrouter.ai)
2. **Credits** → isi saldo (beberapa dolar sudah sangat cukup — model default
   murah dan satu email hanya butuh sekali panggil)
3. **Keys** → *Create Key* → salin nilainya (**hanya ditampilkan sekali**)
4. Isi `OPENROUTER_API_KEY`

Model diatur lewat `OPENROUTER_MODEL` dan bisa diganti tanpa mengubah kode.
Default: `google/gemini-2.5-flash` — cepat, murah, dan cukup untuk membaca email
bank. Daftar model beserta harganya ada di
[openrouter.ai/models](https://openrouter.ai/models).

> Alasan memakai OpenRouter, bukan langsung ke penyedia: satu API key dan satu
> bentuk permintaan untuk semua model. Kalau model default berhenti cocok, yang
> berubah cuma satu baris env — bukan kode klien.

---

## 4 · WAHA — WhatsApp

WAHA (*WhatsApp HTTP API*) adalah layanan yang **Anda jalankan sendiri**, sudah
termasuk di `docker-compose.yml`. Tidak ada pendaftaran dan tidak ada API key
yang diberikan pihak lain — `WAHA_API_KEY` adalah nilai yang **Anda tentukan
sendiri**, lalu dipasang di kedua sisi.

| Variabel | Isi |
|---|---|
| `WAHA_API_KEY` | string acak buatan Anda, dipakai aplikasi **dan** WAHA |
| `WAHA_BASE_URL` | `http://waha:3000` di dalam compose |
| `WAHA_SESSION` | `default`, kecuali Anda mengubahnya di WAHA |
| `WAHA_WEBHOOK_SECRET` | string acak buatan Anda (lihat bagian 1) |

### Menyambungkan nomor

1. Deploy dulu (compose sudah menjalankan service `waha`)
2. Buka dashboard WAHA di `http://ip-server:3001` — masuk dengan
   `WAHA_API_KEY` Anda
3. Mulai sesi, lalu **scan QR** dari HP
4. Daftarkan nomor tiap orang di *Pengaturan → WhatsApp* di dalam aplikasi

> **Pakai nomor khusus bot, bukan nomor pribadi Anda.** WAHA bekerja lewat
> protokol WhatsApp Web yang tidak resmi. Ada kemungkinan nomornya kena
> pembatasan dari WhatsApp, dan Anda tidak ingin itu terjadi pada nomor utama.

Setelah sesi tersambung, port `3001` boleh ditutup dari internet — aplikasi
memanggil WAHA lewat jaringan internal Docker.

### Kalau bot WhatsApp tidak dipakai

Hapus service `waha` dari `docker-compose.yml` dan kosongkan semua variabel
`WAHA_*`. Bot mati; sisanya jalan normal.

---

## 5 · Inbox khusus + forwarding

Dikerjakan **oleh tiap user**, bukan admin. Bukan langkah teknis server, tapi
tanpa ini tidak ada email yang masuk untuk diproses.

1. **Buat akun Gmail baru khusus** untuk menampung notifikasi bank.
   Aplikasi hanya akan diberi akses ke inbox ini — inbox pribadi Anda tidak
   pernah tersentuh. Ini alasan utamanya: scope `gmail.readonly` memberi akses
   baca ke seluruh isi kotak surat yang dihubungkan, jadi hubungkan kotak surat
   yang isinya memang cuma notifikasi bank.

2. **Atur forwarding di Gmail utama**
   *Settings → Forwarding and POP/IMAP → Add a forwarding address* → masukkan
   inbox khusus tadi → verifikasi lewat email konfirmasi.
   Lalu *Filters → Create a new filter*: isi `From` dengan alamat pengirim bank,
   centang **Forward it to** inbox khusus.

3. Di aplikasi: **Pengaturan → Hubungkan Gmail**, setujui di halaman Google,
   lalu **nyalakan** ingestion (defaultnya mati).

4. Uji: jalankan satu putaran manual (`npm run poll`, atau endpoint cron), lalu
   cek halaman Transaksi.

> **Risiko yang masih terbuka:** daftar alamat pengirim di
> [src/lib/gmail/source-mapping.ts](src/lib/gmail/source-mapping.ts) masih
> tebakan berdasarkan domain resmi dan **belum diverifikasi dengan email
> sungguhan**. Langkah pertama setelah forwarding aktif adalah memeriksa alamat
> pengirim yang benar-benar dipakai tiap bank — terutama e-wallet, yang mungkin
> tidak mengirim email transaksi sama sekali.

---

## Deploy ke Coolify

[Coolify](https://coolify.io) adalah PaaS self-hosted: ia mengurus build dari
Git, reverse proxy, dan sertifikat HTTPS otomatis.

### Prasyarat

- VPS dengan Coolify terpasang (minimal 2 GB RAM; instalasi:
  `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`)
- Domain yang **A record**-nya sudah mengarah ke IP VPS itu
- Repository ini bisa diakses Coolify (public, atau lewat GitHub App / deploy key)

### Langkah

**1. Buat resource**

*Project → Add Resource → **Docker Compose*** (bukan "Nixpacks" dan bukan
"Dockerfile" — compose-nya sudah menyusun aplikasi + WAHA sekaligus).

Arahkan ke repository ini, pilih branch, dan isi lokasi compose file:
`docker-compose.yml`.

**2. Lepas publikasi port**

Di `docker-compose.yml`, **hapus blok `ports:` pada service `app`**:

```yaml
    ports:
      - "3000:3000"     # ← hapus baris ini di Coolify
```

Coolify punya proxy sendiri yang menyambung ke port kontainer secara internal.
Kalau port 3000 ikut dipublikasikan ke host, ia bisa bentrok dengan layanan lain
di VPS yang sama dan aplikasi jadi terbuka tanpa HTTPS.

Blok `ports` pada service `waha` **boleh dibiarkan** sampai Anda selesai scan
QR, lalu dihapus.

**3. Isi environment variables**

Di tab *Environment Variables*, tambahkan satu per satu:

```
BETTER_AUTH_SECRET=<hasil openssl rand -base64 32>
BETTER_AUTH_URL=https://domain-anda.com
ENCRYPTION_KEY=<hasil npm run gen:key>

GMAIL_CLIENT_ID=<dari Google Cloud>
GMAIL_CLIENT_SECRET=<dari Google Cloud>
OPENROUTER_API_KEY=<dari openrouter.ai>
OPENROUTER_MODEL=google/gemini-2.5-flash
OWNER_ACCOUNT_NAMES=Nama Anda,NAMA ANDA,N. Anda

WAHA_BASE_URL=http://waha:3000
WAHA_API_KEY=<string acak buatan Anda>
WAHA_SESSION=default
WAHA_WEBHOOK_SECRET=<hasil openssl rand -base64 32>

CRON_SECRET=<hasil openssl rand -base64 32>

OWNER_EMAIL=admin@domain-anda.com
OWNER_PASSWORD=<password kuat>
OWNER_NAME=Nama Admin
```

Tandai `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `GMAIL_CLIENT_SECRET`,
`OPENROUTER_API_KEY`, `WAHA_API_KEY`, `WAHA_WEBHOOK_SECRET`, `CRON_SECRET`, dan
`OWNER_PASSWORD` sebagai **secret** kalau Coolify menyediakan opsinya.

`DATABASE_PATH` **tidak perlu diisi** — compose sudah memakukannya ke
`/app/data/app.db`, di dalam volume.

**4. Pasang domain**

Di daftar service, pada service **`app`**, isi domainnya:

```
https://domain-anda.com
```

dengan port kontainer **3000**. Coolify menerbitkan sertifikat Let's Encrypt
otomatis.

> **Nilai `BETTER_AUTH_URL` harus sama persis dengan domain ini** — skema
> (`https://`), host, tanpa garis miring di akhir. Better Auth membandingkan
> header `Origin` permintaan dengan nilai ini dan **menolak login dengan 403**
> kalau berbeda. Ini penyebab paling umum "sudah deploy tapi tidak bisa login",
> dan pesan errornya tidak menyebut-nyebut `BETTER_AUTH_URL`.

**5. Pastikan volume-nya persisten**

Compose sudah mendeklarasikan named volume `app-data` dan `waha-sessions`;
Coolify menghormatinya. Cek di tab *Storages* bahwa keduanya terdaftar
**sebelum** deploy pertama.

Kalau tidak ada, tambahkan manual: volume `app-data` dipasang ke `/app/data`
pada service `app`. Tanpa itu, seluruh data keuangan hilang setiap kali
redeploy — dan tidak akan terasa sampai deploy kedua.

**6. Deploy**

Tekan **Deploy** lalu ikuti lognya. Yang harus terlihat:

```
[entrypoint] Menyiapkan database...
[entrypoint] Menjalankan: npm run start
  ▲ Next.js 16.2.11
  - Local: http://0.0.0.0:3000
```

Build pertama memakan beberapa menit karena `better-sqlite3` dikompilasi ulang
di stage runtime. Build berikutnya jauh lebih cepat berkat cache layer.

**7. Kembali ke Google Cloud**

Sekarang domainnya sudah pasti — tambahkan redirect URI-nya kalau belum:

```
https://domain-anda.com/api/gmail/callback
```

### Yang khusus perlu diperhatikan di Coolify

| Hal | Penjelasan |
|---|---|
| **Jangan naikkan replika** | Penjadwal polling berjalan **di dalam** proses aplikasi. Dua instance menarik inbox yang sama dua kali bersamaan, dan SQLite hanya mengizinkan satu penulis. |
| **Health check** | `Dockerfile` sudah punya `HEALTHCHECK` ke `/login`. Kalau Coolify meminta path sendiri, pakai `/login` — satu-satunya halaman yang tidak menuntut sesi, jadi 200 di sana benar-benar berarti siap melayani. |
| **Mengubah env = redeploy** | Nilai env dibaca saat proses start. Setelah mengubahnya, jalankan ulang deploy. |
| **Webhook WhatsApp** | Compose sudah mengarahkan WAHA ke `http://app:3000/api/whatsapp/webhook` lewat jaringan internal, jadi biasanya tidak perlu disentuh. URL publiknya (`https://domain-anda.com/api/whatsapp/webhook`) hanya diperlukan kalau WAHA dijalankan di luar compose ini. |

---

## Deploy dengan Docker Compose (VPS manual)

Tanpa Coolify, di VPS mana pun yang punya Docker:

```bash
git clone <repo-anda> financial-tracker
cd financial-tracker
cp .env.example .env
nano .env                       # isi seluruh kredensial
docker compose up -d --build
```

Aplikasi di `:3000`, dashboard WAHA di `:3001`.

Untuk HTTPS, taruh Caddy/nginx di depannya dan arahkan ke `127.0.0.1:3000` —
lalu set `BETTER_AUTH_URL` ke domain HTTPS-nya, bukan ke `http://ip:3000`.

Perintah harian:

```bash
docker compose logs -f app      # ikuti log
docker compose restart app      # restart setelah mengubah .env
docker compose down             # matikan (volume TETAP aman)
docker compose down -v          # ⚠ HAPUS VOLUME — seluruh data keuangan lenyap
```

### Cara kerja image-nya

- **Migrasi jalan di entrypoint**, sebelum server menyala — bukan di dalam proses
  aplikasi. Kalau ikut saat boot, restart beruntun bisa menjalankan dua migrasi
  bersamaan pada berkas SQLite yang sama. `db:setup` idempoten, jadi aman
  dijalankan tiap kontainer start.
- **Basis Debian slim, bukan Alpine.** `better-sqlite3` modul native: di glibc ia
  memakai binary prebuilt, di Alpine (musl) harus dikompilasi dari sumber.
  Selisih ukuran image tidak sebanding dengan risikonya.
- **Dependensi produksi dipasang ulang di stage runtime**, tidak disalin dari
  stage build — binary native harus dibangun terhadap image yang benar-benar
  menjalankannya.
- **Berjalan sebagai user `node`**, bukan root.
- `tsx` ada di `dependencies`, bukan devDependencies — entrypoint memakainya
  untuk menjalankan migrasi, jadi itu kebutuhan runtime yang sungguhan.

---

## Setelah deploy: urutan langkah pertama

1. Buka `https://domain-anda.com` → login dengan `OWNER_EMAIL` / `OWNER_PASSWORD`
2. **Ganti password admin** (Pengaturan → Pengguna)
3. Buat akun untuk anggota lain (Pengaturan → Pengguna)
4. Isi **rekening sendiri** (Pengaturan → Rekening) — ini yang membuat transfer
   antar rekening Anda sendiri tidak terhitung sebagai pengeluaran
5. Periksa **kategori** (Pengaturan → Kategori), sesuaikan seperlunya
6. **Hubungkan Gmail** dan nyalakan ingestion (Pengaturan)
7. Daftarkan **nomor WhatsApp** (Pengaturan → WhatsApp)
8. Kirim **undangan kolaborasi** ke anggota lain (menu Kolaborasi)

---

## Backup & restore

Seluruh keadaan aplikasi ada di **satu berkas SQLite** di dalam volume
`app-data`.

**Backup:**

```bash
docker compose stop app
docker run --rm \
  -v financial-tracker_app-data:/data \
  -v "$PWD:/backup" \
  busybox tar czf /backup/backup-$(date +%F).tar.gz -C /data .
docker compose start app
```

`app` dihentikan lebih dulu agar tidak ada penulisan di tengah penyalinan —
menyalin berkas SQLite yang sedang ditulis bisa menghasilkan arsip yang rusak.

**Restore:**

```bash
docker compose stop app
docker run --rm \
  -v financial-tracker_app-data:/data \
  -v "$PWD:/backup" \
  busybox sh -c "rm -rf /data/* && tar xzf /backup/backup-2026-01-01.tar.gz -C /data"
docker compose start app
```

> **Simpan `ENCRYPTION_KEY` bersama arsipnya.** Backup database tanpa kunci itu
> tetap bisa dipulihkan — transaksi, kategori, user, semuanya kembali — tapi
> **koneksi Gmail di dalamnya tidak bisa dibaca lagi** dan setiap user harus
> menghubungkan ulang.

Di Coolify, gunakan fitur *Backups* untuk menjadwalkan pencadangan volume, dan
tetap catat `ENCRYPTION_KEY` di luar server.

---

## Update ke versi baru

```bash
git pull
docker compose up -d --build
```

Migrasi database jalan otomatis di entrypoint saat kontainer baru start.
Cadangkan dulu sebelum update yang mengubah skema.

---

## Kalau bermasalah

| Gejala | Penyebab paling mungkin |
|---|---|
| **Login gagal / 403** | `BETTER_AUTH_URL` tidak sama persis dengan URL di browser. Cek skema (`http` vs `https`), subdomain, dan garis miring di akhir. |
| **Data hilang setelah redeploy** | Volume `app-data` tidak terpasang. Cek tab *Storages* di Coolify, atau blok `volumes:` di compose. |
| **"Koneksi Gmail bermasalah"** | Refresh token mati. Kalau berulang tiap ~7 hari: OAuth consent screen masih berstatus **Testing** — publikasikan ke *In production*. Kalau muncul setelah pindah server: `ENCRYPTION_KEY` berbeda dari yang dipakai saat token disimpan. |
| **`redirect_uri_mismatch` saat hubungkan Gmail** | Redirect URI di Google Cloud tidak persis sama dengan `https://domain/api/gmail/callback`. Harus sama karakter per karakter. |
| **Bot WhatsApp diam saja** | (a) `WAHA_WEBHOOK_SECRET` kosong → webhook menolak semua pesan; (b) nomor pengirim belum didaftarkan di Pengaturan → WhatsApp — nomor tak terdaftar sengaja diabaikan **tanpa balasan**. |
| **Aplikasi tidak bisa memanggil WAHA** | `WAHA_BASE_URL` diisi `localhost`. Di dalam kontainer, `localhost` menunjuk kontainer itu sendiri — pakai `http://waha:3000`. |
| **Email masuk tapi tidak jadi transaksi** | Alamat pengirim bank belum terdaftar di [src/lib/gmail/source-mapping.ts](src/lib/gmail/source-mapping.ts). Cek `docker compose logs app`. |
| **Transaksi masuk dua kali** | Seharusnya tidak mungkin (`gmail_message_id` unik). Kalau terjadi, periksa apakah ada lebih dari satu instance aplikasi berjalan. |
| **Container restart terus** | `docker compose logs app`. Paling sering: volume `/app/data` tidak bisa ditulis karena pemiliknya root. |

---

# Cara kerja produk

## Model multi-tenant

Setiap user punya datanya sendiri dengan fitur yang sama persis — transaksi,
kategori, rekening, dompet tunai, nomor WhatsApp, dan konfigurasi ingestion.
**Registrasi tertutup**: akun hanya dibuat admin lewat Pengaturan → Pengguna.

Dua aturan yang menjaga isolasinya, keduanya ditegakkan di kode:

1. Setiap fungsi di [src/db/repositories.ts](src/db/repositories.ts) menerima
   `userId` sebagai **parameter pertama yang wajib** — tanpa nilai default,
   sehingga kompiler yang menangkap kelalaian.
2. `update`/`delete` menyaring `id AND user_id`. Menyaring berdasarkan id saja
   berarti siapa pun yang menebak sebuah id bisa mengubah data orang lain lewat
   server action.

`userId` selalu berasal dari sesi, tidak pernah dari argumen server action —
argumen dikirim dari browser dan bisa dipalsukan.

Penyiapan dan pembersihan data akun dipasang sebagai **database hook** Better
Auth ([src/lib/auth.ts](src/lib/auth.ts)), bukan dipanggil dari halaman admin,
supaya semua jalur pembuatan/penghapusan user ikut terjaring.

> **Perubahan aturan:** transfer ke rekening pasangan **tidak lagi** dikecualikan
> sebagai transfer internal — pasangan kini tenant terpisah, jadi itu pengeluaran
> sungguhan. Transfer antar rekening milik user itu sendiri (BCA → SeaBank, top
> up e-wallet) **tetap** dikecualikan.

## Kolaborasi

User bisa berbagi uang dengan user lain. Di sisi pemberi jadi pengeluaran, di
sisi penerima jadi pemasukan, dan pemberi tetap bisa memantau berapa yang sudah
terpakai.

**Entri kolaborasi adalah penghubung, bukan transaksi baru.** Kalau A transfer
ke B lewat bank, bank B juga mengirim email ke aplikasi B — pemasukan itu sudah
tercatat sendiri. Kalau fitur ini ikut membuatkan pemasukan, angkanya jadi
dobel. Karena itu alurnya:

1. Pemberi menandai pengeluarannya sebagai "kolaborasi ke X"
2. Di sisi penerima muncul entri **menunggu dicocokkan** — belum mengubah angka
   apa pun
3. Penerima **mengaitkan** ke transaksi masuk yang sudah ada (transfer bank),
   atau **menerima** kalau memang tidak ada pasangannya (pemberian tunai) — dan
   hanya di jalur kedua sistem membuat transaksi

**Kantong bersaldo** mengikuti pola dompet tunai: dana masuk menambah, transaksi
yang ditandai penerima mengurangi. Saldonya akumulatif lintas periode.

**Batas privasi:** pemberi hanya menerima tiga angka (diberi, terpakai, sisa).
`getCollaborationSummaries()` mengagregasi di SQL sehingga baris transaksi
penerima tidak pernah keluar dari fungsi itu — kalau dikembalikan mentah lalu
dijumlahkan di JavaScript, datanya sudah bocor ke payload RSC meski tidak
dirender. Konsekuensinya disengaja: kalau penerima tidak menandai apa pun,
uangnya terlihat utuh belum terpakai. Sistem tidak menebak.

**Memutus hubungan** punya dua bentuk, karena keduanya sah:

| Aksi | Akibat |
|---|---|
| **Putus** | Hubungan berstatus `revoked`; seluruh riwayat dan angka tetap tersimpan dan bisa dilihat. Bisa disambung lagi kapan saja. |
| **Hapus riwayat** | Baris hubungan dan seluruh entrinya dihapus dari database. Transaksi yang tadinya ditandai tetap ada, hanya penandanya dilepas — jadi tidak ada transaksi yang ikut hilang. |

Mengundang ulang kolaborator yang sudah diputus akan **menghidupkan kembali**
hubungan lama, bukan ditolak sebagai duplikat.

## Dashboard admin

Pengaturan → Pengguna menampilkan, per akun: status ingestion (aktif / dijeda /
belum disetel), polling terakhir, jumlah transaksi, dan aktivitas terakhir —
plus ringkasan seluruh instalasi. Tujuannya menjawab "kenapa data user X tidak
masuk" tanpa perlu membuka isi dompetnya.

Tersedia juga reset password, karena instalasi ini tidak punya email pemulihan.

**Tidak ada fitur "login sebagai user" (impersonation).** Better Auth
menyediakannya, tapi di aplikasi keuangan itu berarti admin bisa membuka seluruh
isi keuangan siapa pun tanpa jejak yang jelas. Yang keluar dari
`getAllUserStats()` hanya angka dan tanggal — agregat dihitung di SQL, isi
transaksinya tidak pernah ikut.

## Bot WhatsApp

**Satu nomor bot untuk seluruh instalasi.** Aplikasi mengenali siapa yang
mengirim dari nomor pengirimnya lalu menulis ke buku orang itu, jadi tidak perlu
sesi WAHA per user.

| Arah | Cara |
|---|---|
| Masuk (WA → aplikasi) | WAHA `POST` ke `/api/whatsapp/webhook` |
| Keluar (aplikasi → WA) | Aplikasi memanggil `POST /api/sendText` dengan header `X-Api-Key` |

### Tiga lapis penjagaan

1. **Header rahasia.** Webhook terbuka ke internet. Tanpa ini, siapa pun yang
   menemukan URL-nya bisa mengirim JSON palsu berisi *"catat pengeluaran 10
   juta"* ke buku Anda, atau memicu panggilan LLM berbayar berulang-ulang.
   Webhook **menolak semua pesan** selama `WAHA_WEBHOOK_SECRET` kosong.
2. **Whitelist nomor.** Nomor tak terdaftar diabaikan **tanpa balasan** — bukan
   dibalas "Anda tidak berhak", karena balasan itu justru memberi tahu penyerang
   bahwa endpoint-nya hidup.
3. **Buku milik siapa ditentukan dari nomor pengirim**, bukan dari isi pesan.

### Aksi destruktif selalu dikonfirmasi

Hapus dan ubah tidak pernah langsung dijalankan dari chat. Bot membalas dengan
ringkasan yang menyebut nominal dan pihaknya, lalu menunggu balasan **YA**.

Yang menjaganya bukan sekadar prompt: aksinya **dikunci di database** saat
konfirmasi diminta, dan balasan "YA" diperiksa sebelum pesan menyentuh LLM sama
sekali. Model tidak punya kesempatan menafsirkan ulang maksud user setelah dia
menjawab. Konfirmasi kedaluwarsa dalam 10 menit, dan satu nomor hanya boleh
punya satu konfirmasi tertunda — kalau ada dua, "YA" jadi ambigu dan bisa
menghapus yang tidak dimaksud.

Mencatat, mencari, dan melaporkan tidak lewat konfirmasi — semuanya tidak
merusak apa pun.

## Halaman

| Rute | Isi |
|---|---|
| `/login` | Login email + password (tidak ada pendaftaran mandiri) |
| `/dashboard` | Ringkasan periode, 5 transaksi terakhir, chart pemasukan & pengeluaran per kategori, rekonsiliasi tunai, report kolaborasi |
| `/transactions` | Daftar + filter + pencarian, tambah transaksi, export Excel, paginasi |
| `/transactions/[id]` | Detail, koreksi data, ubah kategori/status internal, tandai kolaborasi, hapus |
| `/collaboration` | Undangan, kantong dana per kolaborator, entri menunggu dicocokkan |
| `/cash` | Saldo dompet tunai, riwayat, tambah transaksi tunai (masuk/keluar), export Excel |
| `/settings` | Koneksi Gmail, konfigurasi ingestion, status sumber, WhatsApp (URL webhook + whitelist nomor) |
| `/settings/accounts` | Whitelist rekening & e-wallet milik sendiri |
| `/settings/categories` | Kelola daftar kategori tetap |
| `/settings/users` | Manajemen pengguna + status operasional per akun & reset password |

## Struktur & keputusan desain

```
src/
  app/
    (dashboard)/          # area terautentikasi — layout: cek sesi + ambil data
    api/auth/[...all]/    # handler Better Auth
    api/gmail/            # OAuth connect + callback
    api/whatsapp/webhook/ # penerima pesan dari WAHA
    api/cron/poll-gmail/  # pemicu polling manual (shared secret)
    actions.ts            # server action untuk seluruh mutasi
    collaboration-actions.ts
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
    crypto.ts             # AES-256-GCM untuk refresh token
    types.ts              # tipe domain
    store.tsx             # context: data dari server + pemanggil server action
    domain/               # aturan produk: transfer internal, dompet tunai, kolaborasi
    llm/                  # OpenRouter, prompt & skema ekstraksi, kategorisasi
    gmail/                # klien Gmail API, pemetaan pengirim → sumber
    ingestion/            # pipeline email → transaksi, job polling
    whatsapp/             # klien WAHA, agent, tool, konfirmasi
    preferences.ts        # tema & sensor nominal + skrip pra-hydration
    period.ts             # model periode (bulan/tahun/rentang/semua)
    format.ts             # format Rupiah & tanggal, dikunci ke Asia/Jakarta
    export-excel.ts       # export .xlsx
  instrumentation.ts      # penjadwal polling in-process
drizzle/                  # berkas migrasi hasil generate
scripts/                  # db-setup, db-inspect, poll-gmail, seluruh skrip uji
Dockerfile                # image produksi 3 stage
docker-compose.yml        # aplikasi + WAHA
docker-entrypoint.sh      # migrasi sebelum server menyala
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
- **`user_id` sengaja bukan foreign key.** Tabel `user` dimiliki Better Auth dan
  dimigrasikan olehnya; kalau kolom ini mendeklarasikan FK ke sana, dua migrator
  akan berebut urutan pembuatan tabel. Penghapusan berantai ditangani eksplisit
  di `deleteAllUserData()`.

## Pindah ke PostgreSQL

Kalau suatu saat SQLite tidak cukup, seluruh detail dialek sengaja dikurung di
dua berkas:

1. Ganti dialek di [src/db/schema.ts](src/db/schema.ts) dan
   [src/db/connection.ts](src/db/connection.ts)
2. Sesuaikan tipe kolom (`integer` → `bigint`, boolean asli)
3. Jalankan ulang `npm run db:generate`

Tidak ada berkas lain yang membangun kueri — hanya
[src/db/repositories.ts](src/db/repositories.ts) yang mengimpor `drizzle-orm`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite + Drizzle ORM · Better Auth · OpenRouter · WAHA · write-excel-file
