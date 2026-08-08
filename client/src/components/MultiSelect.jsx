import { useEffect, useMemo, useRef, useState } from 'react';

// A dropdown multi-select: closed shows the chosen labels; open shows a
// searchable checkbox list. `value` is an array of string ids.
export default function MultiSelect({ options, value, onChange, placeholder = '—', searchPlaceholder = '' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = useMemo(() => new Set((value || []).map(String)), [value]);
  const label = useMemo(() => {
    const names = options.filter((o) => selected.has(String(o.value))).map((o) => o.label);
    return names.length ? names.join(', ') : placeholder;
  }, [options, selected, placeholder]);

  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  const toggle = (val) => {
    const v = String(val);
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange([...next]);
  };

  return (
    <div className="multiselect" ref={ref}>
      <button type="button" className={'multiselect-control' + (open ? ' open' : '')} onClick={() => setOpen((o) => !o)}>
        <span className={'multiselect-value' + (selected.size ? '' : ' placeholder')}>{label}</span>
        <span className="multiselect-caret">▾</span>
      </button>
      {open && (
        <div className="multiselect-panel">
          {options.length > 6 && (
            <input className="multiselect-search" autoFocus value={q} placeholder={searchPlaceholder}
              onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="multiselect-list">
            {filtered.length === 0 && <div className="multiselect-empty">—</div>}
            {filtered.map((o) => (
              <label key={o.value} className={'multiselect-item' + (selected.has(String(o.value)) ? ' on' : '')}>
                <input type="checkbox" checked={selected.has(String(o.value))} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
