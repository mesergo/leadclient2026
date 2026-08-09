// Phone formatting.
// Israeli numbers -> local dashed form (972585050000 / 585050000 -> 058-5050000).
// Non-Israeli numbers -> international "+<digits>".
// Empty / "0" / all-zeros / too-short -> the given fallback (e.g. "unidentified").
// WhatsApp: keep 972 for Israeli, own country code otherwise.

const groupIL = (loc) => {
  if (loc.length === 10) return `${loc.slice(0, 3)}-${loc.slice(3)}`; // mobile / 07x
  if (loc.length === 9) return `${loc.slice(0, 2)}-${loc.slice(2)}`;  // landline 0X
  return loc;
};

export function formatIL(raw, fallback = '') {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d || /^0+$/.test(d) || d.length < 7) return fallback;
  if (d.startsWith('972')) return groupIL('0' + d.slice(3));
  if (d.startsWith('0')) return groupIL(d);
  if (d.length === 9) return groupIL('0' + d); // IL mobile/landline missing the trunk 0
  return '+' + d; // international
}

export function waNumber(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d || /^0+$/.test(d)) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  if (d.length === 9) return '972' + d;
  return d; // already carries a country code
}
