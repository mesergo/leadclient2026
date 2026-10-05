import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { dateRange, DATE_PRESETS } from '../dates';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const BLANK = { company_id: '', service_id: '', phone_number: '', number_to_display: '', redirect_to_number: '', ivr_provider: 'maskyoo' };

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
  const [sort, setSort] = useState({ col: 'agency_name', dir: 'asc' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // add form
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK, company_id: isSuper || isAgency ? '' : (user?.company_id || '') });
  const [formServices, setFormServices] = useState([]);
  // webhook panel (the number whose Maskyoo URLs we show)
  const [webhookFor, setWebhookFor] = useState(null);

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

  // load channels for the company picked in the add form
  useEffect(() => {
    if (!adding || !form.company_id) { setFormServices([]); return; }
    api.services(token, form.company_id).then((d) => setFormServices(d.services || [])).catch(() => setFormServices([]));
  }, [adding, form.company_id, token]);

  const agencyCompanies = useMemo(
    () => (sel.agency ? companies.filter((c) => String(c.agency_id) === String(sel.agency)) : (isSuper ? [] : companies)),
    [companies, sel.agency]
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    const { col, dir } = sort;
    const cmp = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });
    arr.sort((a, b) => {
      if (col === 'leads_count' || col === 'is_premium') {
        const av = Number(a[col]) || 0, bv = Number(b[col]) || 0;
        return dir === 'asc' ? av - bv : bv - av;
      }
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

  const editChannel = (n) => nav(n.service_id ? `/companies/edit-service?id=${n.service_id}` : `/companies/${n.company_id}`);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'company_id' ? { service_id: '' } : {}) }));
  const saveNumber = async () => {
    setError(''); setMsg('');
    if (!form.phone_number) return setError(t('vir.needNumber'));
    try {
      await api.createVirtual({
        company_id: form.company_id || null, service_id: form.service_id || null,
        phone_number: form.phone_number, number_to_display: form.number_to_display || form.phone_number,
        redirect_to_number: form.redirect_to_number || null, ivr_provider: form.ivr_provider,
      }, token);
      setMsg(t('vir.added')); setAdding(false); setForm({ ...BLANK, company_id: isSuper || isAgency ? '' : (user?.company_id || '') });
      load(preset);
    } catch (e) { setError(e.message); }
  };
  const delNumber = async (n) => {
    if (!window.confirm(t('vir.confirmDelete'))) return;
    try { await api.deleteVirtual(n.id, token); load(preset); } catch (e) { setError(e.message); }
  };
  const copy = (txt) => { try { navigator.clipboard.writeText(txt); setMsg(t('vir.copied')); } catch { /* */ } };
  const hookUrl = (id, ev) => `${ORIGIN}/api/public/call/${id}/${ev}`;

  const addCompanies = isSuper || isAgency ? companies : [];

  return (
    <div>
      <div className="page-header">
        <h1>{t('nav.virtual')}</h1>
        <button className="btn btn-primary" onClick={() => { setAdding((v) => !v); setError(''); setMsg(''); }}>
          {adding ? t('common.cancel') : '+ ' + t('vir.addNumber')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="success-note">{msg}</p>}

      {adding && (
        <div className="form-panel">
          <div className="form-panel-body">
            {(isSuper || isAgency) && (
              <div className="form-field"><label>{t('common.company')}</label><div className="form-field-control">
                <select value={form.company_id} onChange={(e) => setF('company_id', e.target.value)}>
                  <option value="">{t('vir.unassigned')}</option>
                  {addCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div></div>
            )}
            <div className="form-field"><label>{t('lead.channel')}</label><div className="form-field-control">
              <select value={form.service_id} onChange={(e) => setF('service_id', e.target.value)} disabled={!form.company_id}>
                <option value="">{t('vir.noChannel')}</option>
                {formServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div></div>
            <div className="form-field"><label>{t('vir.number')}</label><div className="form-field-control">
              <input value={form.phone_number} onChange={(e) => setF('phone_number', e.target.value)} placeholder="073-xxxxxxx" /></div></div>
            <div className="form-field"><label>{t('vir.display')}</label><div className="form-field-control">
              <input value={form.number_to_display} onChange={(e) => setF('number_to_display', e.target.value)} /></div></div>
            <div className="form-field"><label>{t('vir.target')}</label><div className="form-field-control">
              <input value={form.redirect_to_number} onChange={(e) => setF('redirect_to_number', e.target.value)} placeholder="050-xxxxxxx" /></div></div>
          </div>
          <div className="form-actions"><button className="btn btn-primary" onClick={saveNumber}>{t('common.save')}</button></div>
        </div>
      )}

      {webhookFor && (
        <div className="panel">
          <div className="page-header"><h3>{t('vir.webhooks')} — {webhookFor.phone_number}</h3>
            <button className="btn btn-secondary" onClick={() => setWebhookFor(null)}>{t('common.close')}</button></div>
          <p className="muted">{t('vir.webhooksHint')}</p>
          {[['callStart', 'start'], ['callEnd', 'end']].map(([lbl, ev]) => (
            <div className="form-field" key={ev}><label>{t('vir.' + lbl)}</label>
              <div className="form-field-control" style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={hookUrl(webhookFor.id, ev)} onFocus={(e) => e.target.select()} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                <button className="btn btn-secondary" onClick={() => copy(hookUrl(webhookFor.id, ev))}>{t('vir.copy')}</button>
              </div></div>
          ))}
        </div>
      )}

      <div className="panel dash-filter">
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={sel.agency} onChange={(e) => { const f = { agency: e.target.value, company_id: '' }; setSel(f); load(preset, f); }}>
                <option value="">{t('common.all')}</option>
                <option value="none">{t('vir.unassigned')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {(isSuper || isAgency) && (
            <label className="filter-item"><span>{t('common.company')}</span>
              <select value={sel.company_id} onChange={(e) => { const f = { ...sel, company_id: e.target.value }; setSel(f); load(preset, f); }}>
                <option value="">{t('common.all')}</option>
                {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="filter-item"><span>{t('lead.received')}</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {DATE_PRESETS.map((p) => <option key={p} value={p}>{t('dp.' + p)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" onClick={() => load(preset)}>{t('dash.show')}</button>
        </div>
      </div>
      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          {th('phone_number', t('vir.number'))}{th('redirect_to_number', t('vir.target'))}{th('ivr_provider', t('vir.provider'))}
          {th('agency_name', t('common.agency'))}{th('company_name', t('common.company'))}{th('service_name', t('lead.channel'))}
          {th('leads_count', t('vir.leads'))}<th>{t('vir.actions')}</th>
        </tr></thead>
        <tbody>{sorted.map((n) => (
          <tr key={n.id}>
            <td><button className="link-name" title={t('vir.editChannel')} onClick={() => editChannel(n)}>{n.phone_number}</button></td>
            <td>{n.redirect_to_number || '-'}</td><td>{n.ivr_provider}</td>
            <td>{n.agency_name || t('vir.unassigned')}</td><td>{n.company_name || '-'}</td><td>{n.service_name || '-'}</td>
            <td>{Number(n.leads_count).toLocaleString()}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setWebhookFor(n)}>Maskyoo</button>{' '}
              <button className="btn btn-danger btn-sm" onClick={() => delNumber(n)}>{t('vir.delete')}</button>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {sorted.length === 0 && <p className="muted">{t('vir.none')}</p>}
    </div>
  );
}
