import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const pretty = (s) => { if (!s) return ''; try { return JSON.stringify(typeof s === 'object' ? s : JSON.parse(s), null, 2); } catch { return String(s); } };
const RESULT_COLORS = { lead_created: '#2ecc71', lead_updated: '#00838f', no_match: '#e67e22', number_unassigned: '#e67e22', error: '#e53935' };

export default function WebhookLogPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const isSuper = user?.role === 'super_admin';
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ source: '', result: '' });
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = (f) => api.webhookLog(token, f || filters).then((d) => setLogs(d.logs || [])).catch((e) => setError(e.message));
  useEffect(() => { load(); const iv = setInterval(() => load(), 15000); return () => clearInterval(iv); }, [token]);

  const clear = async () => { if (!window.confirm(t('wl.confirmClear'))) return; try { await api.clearWebhookLog(token); load(); } catch (e) { setError(e.message); } };
  const recover = async () => {
    try {
      const dry = await api.recoverCallDups(token, { hours: 24 });
      if (!dry.candidates || !dry.candidates.length) { window.alert(t('wl.recNone')); return; }
      if (!window.confirm(t('wl.recConfirm').replace('{n}', dry.candidates.length))) return;
      const done = await api.recoverCallDups(token, { hours: 24, apply: true });
      window.alert(t('wl.recDone').replace('{n}', done.created)); load();
    } catch (e) { setError(e.message); }
  };
  const setF = (k, v) => { const f = { ...filters, [k]: v }; setFilters(f); load(f); };

  return (
    <div>
      <div className="page-header">
        <h1>{t('nav.webhookLog')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => load()}>{t('wl.refresh')}</button>
          {isSuper && <button className="btn btn-secondary" onClick={recover}>{t('wl.recover')}</button>}
          {isSuper && <button className="btn btn-danger" onClick={clear}>{t('wl.clear')}</button>}
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>{t('wl.subtitle')}</p>
      {error && <p className="error">{error}</p>}

      <div className="panel dash-filter"><div className="filter-row">
        <label className="filter-item"><span>{t('wl.source')}</span>
          <select value={filters.source} onChange={(e) => setF('source', e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="maskyoo-call">{t('wl.srcCall')}</option>
            <option value="widget">widget</option>
            <option value="company-token">company-token</option>
          </select></label>
        <label className="filter-item"><span>{t('wl.result')}</span>
          <select value={filters.result} onChange={(e) => setF('result', e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="lead_created">lead_created</option>
            <option value="lead_updated">lead_updated</option>
            <option value="no_match">no_match</option>
            <option value="number_unassigned">number_unassigned</option>
          </select></label>
      </div></div>

      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          <th>{t('wl.time')}</th><th>{t('wl.source')}</th><th>{t('wl.method')}</th><th>{t('wl.result')}</th>
          <th>IP</th><th>{t('wl.lead')}</th><th>{t('wl.raw')}</th>
        </tr></thead>
        <tbody>{logs.map((l) => (
          <Fragment key={l.id}>
            <tr>
              <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('he-IL')}</td>
              <td>{l.source === 'maskyoo-call' ? t('wl.srcCall') : (l.source || '-')}</td><td>{l.method}</td>
              <td><span style={{ color: RESULT_COLORS[l.result] || 'inherit', fontWeight: 600 }}>{l.result || '-'}</span>{l.error ? ` · ${l.error}` : ''}</td>
              <td>{l.ip || '-'}</td>
              <td>{l.lead_id ? <button className="link-name" onClick={() => nav(`/leads/${l.lead_id}`)}>#{l.lead_id}</button> : '-'}</td>
              <td><button className="btn btn-secondary btn-sm" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? t('wl.hide') : t('wl.show')}</button></td>
            </tr>
            {open === l.id && (
              <tr><td colSpan={7}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><strong>{t('wl.path')}</strong><div className="muted" style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{l.path}</div>
                    <strong>query</strong><pre style={{ background: 'var(--bg)', padding: 8, borderRadius: 6, overflow: 'auto', fontSize: 12 }}>{pretty(l.query_data) || '{}'}</pre></div>
                  <div><strong>body</strong><pre style={{ background: 'var(--bg)', padding: 8, borderRadius: 6, overflow: 'auto', fontSize: 12 }}>{pretty(l.body_data) || '{}'}</pre>
                    <div className="muted" style={{ fontSize: 12 }}>number #{l.matched_number_id || '-'} · company #{l.company_id || '-'}</div></div>
                </div>
              </td></tr>
            )}
          </Fragment>
        ))}</tbody>
      </table></div>
      {logs.length === 0 && <p className="muted">{t('wl.none')}</p>}
    </div>
  );
}
