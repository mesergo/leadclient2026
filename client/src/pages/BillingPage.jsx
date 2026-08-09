import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function BillingPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const isSuper = user?.role === 'super_admin';
  const isAgency = user?.role === 'agency_admin';

  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [flt, setFlt] = useState({ month: thisMonth(), agency: '', company_id: '' });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const load = (f = flt) => api.billing(token, { month: f.month, agency: f.agency || undefined, company_id: f.company_id || undefined })
    .then((d) => setRows(d.rows)).catch((e) => setError(e.message));

  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    if (isSuper || isAgency) api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
    load();
  }, [token]);

  const agencyCompanies = useMemo(
    () => (flt.agency ? companies.filter((c) => String(c.agency_id) === String(flt.agency)) : companies),
    [companies, flt.agency]
  );
  const num = (n) => Number(n || 0).toLocaleString();

  const totals = useMemo(() => rows.reduce((a, r) => ({
    numbers: a.numbers + r.numbers, calls: a.calls + r.calls, minutes: a.minutes + r.minutes, sms: a.sms + r.sms, leads: a.leads + r.leads,
  }), { numbers: 0, calls: 0, minutes: 0, sms: 0, leads: 0 }), [rows]);

  return (
    <div>
      <div className="page-header"><h1>{t('nav.billing')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>{t('bil.subtitle')}</p>
      {error && <p className="error">{error}</p>}

      <div className="panel dash-filter">
        <div className="filter-row">
          <label className="filter-item"><span>{t('bil.month')}</span>
            <input type="month" value={flt.month} onChange={(e) => setFlt({ ...flt, month: e.target.value })} />
          </label>
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={flt.agency} onChange={(e) => setFlt({ ...flt, agency: e.target.value, company_id: '' })}>
                <option value="">{t('common.all')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          )}
          {(isSuper || isAgency) && (
            <label className="filter-item"><span>{t('common.company')}</span>
              <select value={flt.company_id} onChange={(e) => setFlt({ ...flt, company_id: e.target.value })}>
                <option value="">{t('common.all')}</option>
                {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          )}
          <button className="btn btn-primary" onClick={() => load()}>{t('dash.show')}</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="stat-grid">
          <div className="stat-tile stat-cyan"><div><div className="num">{num(totals.numbers)}</div><div className="lbl">{t('bil.numbers')}</div></div></div>
          <div className="stat-tile stat-green"><div><div className="num">{num(totals.calls)}</div><div className="lbl">{t('bil.calls')}</div></div></div>
          <div className="stat-tile stat-amber"><div><div className="num">{num(totals.minutes)}</div><div className="lbl">{t('bil.minutes')}</div></div></div>
          <div className="stat-tile stat-pink"><div><div className="num">{num(totals.sms)}</div><div className="lbl">{t('bil.sms')}</div></div></div>
          <div className="stat-tile stat-gold"><div><div className="num">{num(totals.leads)}</div><div className="lbl">{t('bil.leadsCol')}</div></div></div>
        </div>
      )}

      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          {(isSuper || isAgency) && <th>{t('common.agency')}</th>}
          <th>{t('common.company')}</th>
          <th>{t('bil.numbers')}</th><th>{t('bil.calls')}</th><th>{t('bil.minutes')}</th><th>{t('bil.sms')}</th><th>{t('bil.leadsCol')}</th>
        </tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.company_id}>
            {(isSuper || isAgency) && <td>{r.agency_name}</td>}
            <td>{r.company_name}</td>
            <td>{num(r.numbers)}{r.premium ? ` (${num(r.premium)}★)` : ''}</td>
            <td>{num(r.calls)}</td><td>{num(r.minutes)}</td><td>{num(r.sms)}</td><td>{num(r.leads)}</td>
          </tr>
        ))}
          {rows.length > 0 && (
            <tr className="matrix-total">
              {(isSuper || isAgency) && <td></td>}
              <td><strong>{t('rep.grandTotal')}</strong></td>
              <td><strong>{num(totals.numbers)}</strong></td><td><strong>{num(totals.calls)}</strong></td>
              <td><strong>{num(totals.minutes)}</strong></td><td><strong>{num(totals.sms)}</strong></td><td><strong>{num(totals.leads)}</strong></td>
            </tr>
          )}
        </tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('bil.none')}</p>}
    </div>
  );
}
