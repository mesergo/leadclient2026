import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { dateRange, DATE_PRESETS } from '../dates';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const HOOK_URL = `${ORIGIN}/api/public/call`;
const BLANK = { phone_number: '', number_to_display: '', ivr_provider: 'maskyoo' };
const ACTIONS = { created: 'נוצר', assigned: 'שויך', transferred: 'הועבר', unassigned: 'שוחרר', updated: 'עודכן', deleted: 'נמחק' };

export default function VirtualPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const isSuper = user?.role === 'super_admin';
  const isAgency = user?.role === 'agency_admin';
  const [rows, setRows] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [preset, setPreset] = useState('allTime');
  const [sel, setSel] = useState({ agency: '', company_id: '' });
  const [sort, setSort] = useState({ col: 'phone_number', dir: 'asc' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [logFor, setLogFor] = useState(null);   // number whose log is open
  const [logRows, setLogRows] = useState([]);

  const load = (p, filters) => {
    const { start, end } = dateRange(p);
    const f = filters || sel;
    api.virtual(token, { start, end, agency: f.agency || undefined, company_id: f.company_id || undefined })
      .then((d) => setRows(d.numbers)).catch((e) => setError(e.message));
  };
  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    if (isSuper || isAgency) api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
    load(preset, { agency: '', company_id: '' });
  }, [token]);

  const agencyCompanies = useMemo(
    () => (sel.agency ? companies.filter((c) => String(c.agency_id) === String(sel.agency)) : (isSuper ? [] : companies)),
    [companies, sel.agency]
  );

  const sorted = useMemo(() => {
    const arr = [...rows]; const { col, dir } = sort;
    const cmp = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });
    arr.sort((a, b) => {
      if (col === 'leads_count') { const av = Number(a[col]) || 0, bv = Number(b[col]) || 0; return dir === 'asc' ? av - bv : bv - av; }
      const av = (a[col] ?? '').toString().trim(), bv = (b[col] ?? '').toString().trim();
      return dir === 'asc' ? cmp.compare(av, bv) : cmp.compare(bv, av);
    });
    return arr;
  }, [rows, sort]);

  const th = (col, label) => (
    <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label} {sort.col === col ? (sort.dir === 'asc' ? '▴' : '▾') : '⇅'}
    </th>
  );
  const editChannel = (n) => n.service_id && nav(`/companies/edit-service?id=${n.service_id}`);
  const copy = (txt) => { try { navigator.clipboard.writeText(txt); setMsg(t('vir.copied')); } catch { /* */ } };
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveNumber = async () => {
    setError(''); setMsg('');
    if (!form.phone_number) return setError(t('vir.needNumber'));
    try {
      await api.createVirtual({ phone_number: form.phone_number, number_to_display: form.number_to_display || form.phone_number, ivr_provider: form.ivr_provider }, token);
      setMsg(t('vir.added')); setAdding(false); setForm({ ...BLANK }); load(preset);
    } catch (e) { setError(e.message); }
  };
  const delNumber = async (n) => { if (!window.confirm(t('vir.confirmDelete'))) return; try { await api.deleteVirtual(n.id, token); load(preset); } catch (e) { setError(e.message); } };
  const openLog = async (n) => {
    setLogFor(n); setLogRows([]);
    try { const d = await api.virtualLog(n.id, token); setLogRows(d.log || []); } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('nav.virtual')}</h1>
        <button className="btn btn-primary" onClick={() => { setAdding((v) => !v); setError(''); setMsg(''); }}>{adding ? t('common.cancel') : '+ ' + t('vir.addNumber')}</button>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>{t('vir.poolHint')}</p>
      {error && <p className="error">{error}</p>}
      {msg && <p className="success-note">{msg}</p>}

      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>{t('vir.webhooks')}:</strong>
        <input readOnly value={HOOK_URL} onFocus={(e) => e.target.select()} style={{ fontFamily: 'monospace', fontSize: 12, flex: 1, minWidth: 220 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => copy(HOOK_URL)}>{t('vir.copy')}</button>
      </div>

      {adding && (
        <div className="form-panel">
          <div className="form-panel-body">
            <div className="form-field"><label>{t('vir.number')}</label><div className="form-field-control"><input value={form.phone_number} onChange={(e) => setF('phone_number', e.target.value)} placeholder="055-4566000" /></div></div>
            <div className="form-field"><label>{t('vir.display')}</label><div className="form-field-control"><input value={form.number_to_display} onChange={(e) => setF('number_to_display', e.target.value)} /></div></div>
            <div className="form-field"><label>{t('vir.provider')}</label><div className="form-field-control">
              <select value={form.ivr_provider} onChange={(e) => setF('ivr_provider', e.target.value)}>
                {['maskyoo', 'native', 'micropay', 'paycall'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select></div></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={saveNumber}>{t('common.save')}</button></div>
          <p className="muted" style={{ padding: '0 1rem 1rem' }}>{t('vir.addNote')}</p>
        </div>
      )}

      {logFor && (
        <div className="panel">
          <div className="page-header"><h3>{t('vir.logTitle')} — {logFor.phone_number}</h3><button className="btn btn-secondary" onClick={() => setLogFor(null)}>{t('common.close')}</button></div>
          {logRows.length === 0 ? <p className="muted">{t('vir.noLog')}</p> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t('wl.time')}</th><th>{t('vir.action')}</th><th>{t('vir.from')}</th><th>{t('vir.to')}</th><th>{t('lead.channel')}</th><th>{t('vir.by')}</th></tr></thead>
              <tbody>{logRows.map((lg) => (
                <tr key={lg.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(lg.created_at).toLocaleString('he-IL')}</td>
                  <td><strong>{ACTIONS[lg.action] || lg.action}</strong></td>
                  <td>{lg.from_company || '-'}</td><td>{lg.to_company || '-'}</td>
                  <td>{lg.service_name || '-'}</td><td>{lg.user_name || '-'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      <div className="panel dash-filter"><div className="filter-row">
        {isSuper && (
          <label className="filter-item"><span>{t('common.agency')}</span>
            <select value={sel.agency} onChange={(e) => { const f = { agency: e.target.value, company_id: '' }; setSel(f); load(preset, f); }}>
              <option value="">{t('common.all')}</option><option value="none">{t('vir.unassigned')}</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
        )}
        {(isSuper || isAgency) && (
          <label className="filter-item"><span>{t('common.company')}</span>
            <select value={sel.company_id} onChange={(e) => { const f = { ...sel, company_id: e.target.value }; setSel(f); load(preset, f); }}>
              <option value="">{t('common.all')}</option>
              {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
        )}
        <button className="btn btn-primary" onClick={() => load(preset)}>{t('dash.show')}</button>
      </div></div>

      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          {th('phone_number', t('vir.number'))}{th('ivr_provider', t('vir.provider'))}<th>{t('vir.status')}</th>
          {th('company_name', t('common.company'))}{th('service_name', t('lead.channel'))}{th('redirect_to_number', t('vir.target'))}
          {th('leads_count', t('vir.leads'))}<th>{t('vir.actions')}</th>
        </tr></thead>
        <tbody>{sorted.map((n) => (
          <tr key={n.id}>
            <td><strong>{n.phone_number}</strong></td><td>{n.ivr_provider}</td>
            <td>{n.available ? <span className="pill pill-on">{t('vir.available')}</span> : <span className="pill" style={{ background: 'rgba(0,131,143,0.12)', color: 'var(--accent)' }}>{t('vir.assigned')}</span>}</td>
            <td>{n.company_name || '-'}</td>
            <td>{n.service_id ? <button className="link-name" onClick={() => editChannel(n)}>{n.service_name || t('vir.editChannel')}</button> : '-'}</td>
            <td>{n.redirect_to_number || '-'}</td>
            <td>{Number(n.leads_count).toLocaleString()}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openLog(n)}>{t('vir.log')}</button>{' '}
              <button className="btn btn-danger btn-sm" onClick={() => delNumber(n)}>{t('vir.delete')}</button>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {sorted.length === 0 && <p className="muted">{t('vir.none')}</p>}
    </div>
  );
}
