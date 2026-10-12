// Same phone on the same day (by created_at, Israel time) = one group in the leads list.
// Groups keep the order of their first lead in the (already sorted) list, so the head is the newest.
function groupKey(l) {
  const digits = String(l.lead_phone || '').replace(/\D/g, '');
  if (digits.length < 7 || /^0+$/.test(digits)) return null; // hidden/invalid number: never merged
  const day = String(l.created_at || '').slice(0, 10);
  return day ? `${digits.slice(-9)}|${day}` : null;
}

// -> [{ key, leads: [newest, ...] }]
export function groupLeads(leads) {
  const out = [];
  const byKey = new Map();
  for (const l of leads) {
    const k = groupKey(l);
    const g = k && byKey.get(k);
    if (g) { g.leads.push(l); continue; }
    const ng = { key: k || `id:${l.id}`, leads: [l] };
    if (k) byKey.set(k, ng);
    out.push(ng);
  }
  return out;
}
