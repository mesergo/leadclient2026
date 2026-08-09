// Phone formatting.
// Israeli numbers -> local dashed form:
//   972585050000 / 585050000 / 0585050000 -> 058-5050000  (mobile 3-7)
//   36147166 / 036147166       -> 03-6147166               (landline 2-7, trunk 0 missing)
//   723306060 / 0723306060     -> 072-3306060              (3-7)
// Non-Israeli numbers -> international "+<digits>".
// Empty / "0" / all-zeros / too-short -> the given fallback (e.g. "unidentified").

const groupIL = (loc) => {
  if (loc.length === 10) return `${loc.slice(0, 3)}-${loc.slice(3)}`; // mobile / 07x
  if (loc.length === 9) return `${loc.slice(0, 2)}-${loc.slice(2)}`;  // landline 0X
  return loc;
};

export function formatIL(raw, fallback = '') {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d || /^0+$/.test(d) || d.length < 8) return fallback;
  if (d.startsWith('972')) return groupIL('0' + d.slice(3));
  if (d.startsWith('0')) return groupIL(d);
  if (d.length === 8 || d.length === 9) return groupIL('0' + d); // Israeli missing the trunk 0
  return '+' + d; // international (has its own country code)
}

export function waNumber(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d || /^0+$/.test(d)) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  if (d.length === 8 || d.length === 9) return '972' + d;
  return d; // already carries a country code
}
