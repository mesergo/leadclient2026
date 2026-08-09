// Parse a MySQL datetime string ("2026-08-06 21:20:20", server-local) to a Date.
const parse = (s) => {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
};

export const isRecent = (s, mins = 5) => {
  const d = parse(s);
  return !!d && (Date.now() - d.getTime()) < mins * 60000;
};

// Relative Hebrew/English time using i18n templates ("usr.ago.*" with {n}).
export function timeAgo(s, t) {
  const d = parse(s);
  if (!d) return null;
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  const fmt = (key, n) => (t ? t(key).replace('{n}', n) : `${n}`);
  if (sec < 60) return t ? t('usr.now') : 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return fmt('usr.ago.min', min);
  const hr = Math.floor(min / 60);
  if (hr < 24) return fmt('usr.ago.hour', hr);
  const day = Math.floor(hr / 24);
  if (day < 30) return fmt('usr.ago.day', day);
  const mo = Math.floor(day / 30);
  if (mo < 12) return fmt('usr.ago.month', mo);
  return fmt('usr.ago.year', Math.floor(day / 365));
}
