// Tag display helpers. Auto tags (e.g. call disposition from the IVR) are stored
// as legacy i18n placeholders like "[lang:ANSWER]" — map them to Hebrew + flag them.
const AUTO_MAP = {
  ANSWER: 'שיחה נענתה',
  'NO ANSWER': 'אין תשובה',
  'CALLER CANCEL': 'המתקשר ביטל',
  'CALLER CANCELLED': 'המתקשר ביטל',
  BUSY: 'קו תפוס',
  '0': 'ללא מענה',
};

export function isAutoTag(label) {
  return /^\s*\[lang:/i.test(label || '');
}

export function displayTag(label) {
  const m = (label || '').match(/^\s*\[lang:\s*(.+?)\s*\]\s*$/i);
  if (!m) return label;
  const key = m[1].trim().toUpperCase();
  return AUTO_MAP[key] || m[1].trim();
}

// The call recording download URL is embedded in the raw lead data (a Maskyoo /
// IVR download link). Pull the first recording-like URL out of the raw text.
export function extractRecordingUrl(raw) {
  if (!raw) return null;
  const urls = String(raw).match(/https?:\/\/[^\s"'<>]+/gi) || [];
  return urls.find((u) => /download\.php|maskyoo|recording|\.mp3|\.wav/i.test(u)) || null;
}
