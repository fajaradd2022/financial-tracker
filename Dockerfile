# syntax=docker/dockerfile:1

# =============================================================================
# Financial Tracker — image produksi
# =============================================================================
#
# Basis Debian slim, bukan Alpine. `better-sqlite3` adalah modul native: di
# glibc ia memakai binary prebuilt, sedangkan di Alpine (musl) ia harus
# dikompilasi dari sumber — lebih lambat dan lebih rapuh. Selisih ukuran
# image-nya tidak sebanding dengan risiko itu untuk aplikasi sekecil ini.
#
# Versi Node dipaku, bukan `node:22`. Tag mayor bergeser diam-diam, dan modul
# native harus dikompilasi untuk versi ABI yang sama dengan yang menjalankannya.

# -----------------------------------------------------------------------------
# 1. Dependensi — dipisah agar layer-nya bisa di-cache selama package.json tetap
# -----------------------------------------------------------------------------
FROM node:22.18.0-bookworm-slim AS deps
WORKDIR /app

# Diperlukan untuk mengompilasi better-sqlite3 kalau binary prebuilt-nya tidak
# tersedia. Hanya ada di stage ini, tidak ikut ke image akhir.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# -----------------------------------------------------------------------------
# 2. Build
# -----------------------------------------------------------------------------
FROM node:22.18.0-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Nilai sementara hanya agar `next build` tidak gagal saat mengumpulkan halaman.
# Kredensial sungguhan diberikan saat runtime — tidak ada yang tersimpan di image.
ENV NEXT_TELEMETRY_DISABLED=1
ENV BETTER_AUTH_SECRET=build-time-placeholder-tidak-dipakai-saat-runtime
RUN npm run build

# -----------------------------------------------------------------------------
# 3. Runtime
# -----------------------------------------------------------------------------
FROM node:22.18.0-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Tanpa ini Next.js hanya mendengarkan localhost di dalam kontainer, dan
# port yang dipetakan dari luar tidak akan pernah menjawab.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Dependensi produksi dipasang ULANG di sini, bukan disalin dari stage deps:
# binary native harus dibangun terhadap image yang benar-benar menjalankannya.
RUN npm ci --omit=dev && npm cache clean --force

# Build tools dibuang setelah native module terpasang — mengurangi ukuran image
# sekaligus permukaan serangannya.
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Dibutuhkan entrypoint saat migrasi, bukan oleh server-nya:
# - drizzle/ : berkas migrasi SQL
# - src/     : skema, repository, dan konfigurasi auth yang diimpor skrip setup
# - scripts/ : skrip setup itu sendiri
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Database tinggal di volume. Direktorinya dibuat lebih dulu dan dimiliki user
# `node` — kalau Docker yang membuatnya saat mount, pemiliknya root dan proses
# non-root tidak bisa menulis ke sana.
RUN mkdir -p /app/data && chown -R node:node /app/data

# Tidak berjalan sebagai root. Kalau ada celah di aplikasi, batas kerusakannya
# berhenti di user tanpa hak istimewa.
USER node

EXPOSE 3000

# Health check menyasar halaman login: satu-satunya halaman yang tidak menuntut
# sesi, jadi 200 di sini benar-benar berarti server siap melayani.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
