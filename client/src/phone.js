// Israeli phone formatting.
// Display: local dashed form, e.g. 972585050000 / 585050000 -> 058-5050000.
// WhatsApp: international form keeping 972, e.g. 972585050000.

export function formatIL(raw) {
  if (raw == null || raw === '') return '';
  let d = String(raw).replace(/\D/g, '');
  if (!d) return String(raw);
  if (d.startsWith('972')) d = '0' + d.slice(3);
  else if (!d.startsWith('0')) d = '0' + d;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3)}`; // mobile / 07x
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2)}`;  // landline 0X
  return d; // short codes / other lengths — leave normalised
}

export function waNumber(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  return '972' + d;
}
