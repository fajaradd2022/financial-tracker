/**
 * Preferensi tampilan yang disimpan di browser, plus skrip yang menerapkannya
 * sebelum React hydrate.
 *
 * PENTING — modul ini sengaja TIDAK memakai "use client".
 *
 * Root layout adalah server component. Kalau string skrip ini diekspor dari
 * modul "use client", yang diterima layout bukan stringnya melainkan *client
 * reference*, dan yang tertulis ke HTML jadi sampah (bukan skrip yang bisa
 * jalan). Karena itu nilai-nilai di bawah harus tinggal di modul netral yang
 * bisa diimpor sisi server maupun client.
 */

export const THEME_KEY = "financial-tracker:theme";
export const BALANCE_KEY = "financial-tracker:balance-hidden";

/**
 * Dijalankan sinkron saat browser mem-parse HTML, sebelum paint pertama.
 *
 * Untuk tema ini mencegah kedipan; untuk sensor nominal ini lebih dari
 * kosmetik — kalau status "disembunyikan" baru diterapkan setelah hydration,
 * angka aslinya sempat terlihat, persis yang ingin dicegah.
 */
export const preferencesInitScript = `(function(){
try {
  var t = localStorage.getItem(${JSON.stringify(THEME_KEY)});
  var dark = t ? t === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
try {
  if (localStorage.getItem(${JSON.stringify(BALANCE_KEY)}) === '1') {
    document.documentElement.setAttribute('data-balance', 'hidden');
  }
} catch (e) {}
})();`;
