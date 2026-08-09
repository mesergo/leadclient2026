import { useState } from 'react';
import { useLang } from '../context/LangContext';

export const emptyRedirect = () => ({ type: 'sequential', ring_seconds: 25, numbers: [''] });

// Normalise anything coming from the API into a {type, ring_seconds, numbers[]} object.
export function toRedirect(raw, fallbackNumber) {
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  if (o && Array.isArray(o.numbers)) {
    return { type: o.type === 'parallel' ? 'parallel' : 'sequential', ring_seconds: Number(o.ring_seconds) || 25, numbers: o.numbers.length ? o.numbers.map(String) : [''] };
  }
  return { type: 'sequential', ring_seconds: 25, numbers: [fallbackNumber ? String(fallbackNumber) : ''] };
}

export default function RedirectConfig({ value, onChange }) {
  const { t } = useLang();
  const [adv, setAdv] = useState(false);
  const v = value || emptyRedirect();
  const numbers = v.numbers.length ? v.numbers : [''];

  const setNumber = (i, val) => onChange({ ...v, numbers: numbers.map((n, ni) => (ni === i ? val : n)) });
  const addNumber = () => onChange({ ...v, numbers: [...numbers, ''] });
  const removeNumber = (i) => onChange({ ...v, numbers: numbers.filter((_, ni) => ni !== i).length ? numbers.filter((_, ni) => ni !== i) : [''] });

  return (
    <div className="redirect-config">
      {numbers.map((n, i) => (
        <div className="redirect-row" key={i}>
          <input value={n} onChange={(e) => setNumber(i, e.target.value)} placeholder={t('rc.numberPh')} />
          {numbers.length > 1 && (
            <button type="button" className="rc-btn rc-btn--red" title="-" onClick={() => removeNumber(i)}>−</button>
          )}
          {i === numbers.length - 1 && (
            <button type="button" className="rc-btn rc-btn--green" title={t('rc.addNumber')} onClick={addNumber}>+</button>
          )}
        </div>
      ))}
      <button type="button" className="rc-advanced-toggle" onClick={() => setAdv((a) => !a)}>
        {adv ? '▾' : '▸'} {t('rc.advanced')}
      </button>
      {adv && (
        <div className="rc-advanced">
          <label className="rc-field"><span>{t('rc.type')}</span>
            <select value={v.type} onChange={(e) => onChange({ ...v, type: e.target.value })}>
              <option value="sequential">{t('rc.sequential')}</option>
              <option value="parallel">{t('rc.parallel')}</option>
            </select>
          </label>
          <label className="rc-field"><span>{t('rc.ring')}</span>
            <input type="number" min="5" max="120" value={v.ring_seconds}
              onChange={(e) => onChange({ ...v, ring_seconds: Number(e.target.value) || 0 })} />
          </label>
        </div>
      )}
    </div>
  );
}
