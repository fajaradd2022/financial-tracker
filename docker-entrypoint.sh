#!/bin/sh
set -e

# Menyiapkan database sebelum server menyala.
#
# Migrasi dijalankan di sini, bukan di dalam aplikasi saat boot: kalau ikut di
# dalam proses server, restart yang cepat berturut-turut bisa menjalankan dua
# migrasi bersamaan pada berkas SQLite yang sama. Di entrypoint, ia selesai
# lebih dulu dan server baru dimulai setelahnya.
#
# `db:setup` bersifat idempoten — aman dijalankan setiap kali kontainer start.
echo "[entrypoint] Menyiapkan database..."
npm run db:setup

# Peringatan, bukan penghentian: aplikasi tetap berguna tanpa kredensial ini
# (pencatatan manual lewat web jalan penuh), yang mati hanya ingestion dan bot.
# Menolak start justru membuat aplikasi tidak bisa dipakai sama sekali.
if [ -z "$BETTER_AUTH_SECRET" ]; then
  echo "[entrypoint] PERINGATAN: BETTER_AUTH_SECRET kosong — memakai fallback pengembangan."
  echo "[entrypoint]              Semua sesi login akan invalid saat nilainya berubah."
fi
if [ -z "$ENCRYPTION_KEY" ]; then
  echo "[entrypoint] PERINGATAN: ENCRYPTION_KEY kosong — Gmail tidak bisa dihubungkan."
fi

echo "[entrypoint] Menjalankan: $*"

# `exec` menggantikan proses shell dengan proses Node, sehingga SIGTERM dari
# `docker stop` sampai langsung ke aplikasi. Tanpa itu, shell menelan sinyalnya
# dan kontainer baru mati setelah dipaksa — berisiko memutus penulisan SQLite
# di tengah jalan.
exec "$@"
