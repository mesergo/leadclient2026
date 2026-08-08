// Date-range presets matching the legacy dashboard. Returns {start,end} as YYYY-MM-DD (local).
const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const DATE_PRESETS = ['allTime', 'today', 'yesterday', 'last2', 'thisWeek', 'last7', 'prevWeek', 'last14', 'thisMonth', 'last30', 'prevMonth'];

export function dateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'allTime': return { start: '', end: '' };
    case 'today': return { start: fmt(today), end: fmt(today) };
    case 'yesterday': { const y = addDays(today, -1); return { start: fmt(y), end: fmt(y) }; }
    case 'last2': return { start: fmt(addDays(today, -1)), end: fmt(today) };
    case 'thisWeek': { const sun = addDays(today, -today.getDay()); return { start: fmt(sun), end: fmt(today) }; }
    case 'last7': return { start: fmt(addDays(today, -6)), end: fmt(today) };
    case 'prevWeek': { const thisSun = addDays(today, -today.getDay()); const prevSun = addDays(thisSun, -7); return { start: fmt(prevSun), end: fmt(addDays(prevSun, 6)) }; }
    case 'last14': return { start: fmt(addDays(today, -13)), end: fmt(today) };
    case 'thisMonth': { const first = new Date(now.getFullYear(), now.getMonth(), 1); return { start: fmt(first), end: fmt(today) }; }
    case 'last30': return { start: fmt(addDays(today, -29)), end: fmt(today) };
    case 'prevMonth': { const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); const last = new Date(now.getFullYear(), now.getMonth(), 0); return { start: fmt(first), end: fmt(last) }; }
    default: return { start: fmt(today), end: fmt(today) };
  }
}
