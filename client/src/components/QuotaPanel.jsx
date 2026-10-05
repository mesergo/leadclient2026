import { useEffect, useState } from 'react';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const ROWS = [
  ['users', 'quota.users'],
  ['numbers', 'quota.numbers'],
  ['leads', 'quota.leads'],
  ['channels', 'quota.channels'],
];

// Usage-vs-quota display. Read-only; shows a bar per resource and flags
// over/near-limit. `reloadKey` forces a refetch (e.g. after a manager saves).
export default function QuotaPanel({ companyId, token, reloadKey }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!companyId) return;
    api.companyUsage(companyId, token).then(setData).catch((e) => setError(e.message));
  }, [companyId, token, reloadKey]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;

  return (
    <div className="quota-panel">
      <table className="data-table">
        <thead><tr><th>{t('quota.resource')}</th><th>{t('quota.usage')}</th><th>{t('quota.limit')}</th><th>{t('quota.status')}</th></tr></thead>
        <tbody>
          {ROWS.map(([k, lbl]) => {
            const used = data.usage[k] || 0;
            const limit = data.quota[k];
            const unlimited = limit == null || limit === '';
            const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
            const over = !unlimited && used >= limit;
            const near = !unlimited && !over && used >= limit * 0.8;
            const color = over ? '#dc2626' : near ? '#f59e0b' : '#16a34a';
            return (
              <tr key={k}>
                <td>{t(lbl)}</td>
                <td>{used.toLocaleString()}</td>
                <td>{unlimited ? '∞' : limit.toLocaleString()}</td>
                <td style={{ minWidth: 160 }}>
                  {unlimited ? <span className="muted">{t('quota.unlimited')}</span> : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: pct + '%', height: '100%', background: color }} />
                      </div>
                      {over && <span className="tag-chip" style={{ background: '#dc262622', color: '#dc2626' }}>{t('quota.over')}</span>}
                      {near && <span className="tag-chip" style={{ background: '#f59e0b22', color: '#b45309' }}>{t('quota.near')}</span>}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
