import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { dateRange, DATE_PRESETS } from '../dates';

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
    () => (sel.agency ? companies.filter((c) => String(c.agency_id) === String(sel.agency)) : companies),
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

  // clicking a number opens the channel's company (where the channel is edited)
  const editChannel = (n) => nav(n.agency_id ? `/companies?agency=${n.agency_id}` : `/companies/${n.company_id}`);

  return (
    <div>
      <div className="page-header"><h1>{t('nav.virtual')}</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="panel dash-filter">
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={sel.agency} onChange={(e) => { const f = { agency: e.target.value, company_id: '' }; setSel(f); load(preset, f); }}>
                <option value="">{t('common.all')}</option>
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
          {th('leads_count', t('vir.leads'))}{th('is_premium', t('vir.premium'))}
        </tr></thead>
        <tbody>{sorted.map((n) => (
          <tr key={n.id}>
            <td><button className="link-name" title={t('vir.editChannel')} onClick={() => editChannel(n)}>{n.phone_number}</button></td>
            <td>{n.redirect_to_number || '-'}</td><td>{n.ivr_provider}</td>
            <td>{n.agency_name || '-'}</td><td>{n.company_name || '-'}</td><td>{n.service_name || '-'}</td>
            <td>{Number(n.leads_count).toLocaleString()}</td>
            <td>{n.is_premium ? t('common.yes') : t('common.no')}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {sorted.length === 0 && <p className="muted">{t('vir.none')}</p>}
    </div>
  );
}
