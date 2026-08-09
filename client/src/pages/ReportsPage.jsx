import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { dateRange, DATE_PRESETS } from '../dates';
import { displayStatus } from '../tags';

export default function ReportsPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const isSuper = user?.role === 'super_admin';
  const isAgency = user?.role === 'agency_admin';

  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sel, setSel] = useState({ agency: '', company_id: isSuper || isAgency ? '' : (user?.company_id || '') });
  const [preset, setPreset] = useState('thisMonth');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    if (isSuper || isAgency) api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
    if (!isSuper && !isAgency && user?.company_id) run(user.company_id, preset);
  }, [token]);

  const agencyCompanies = useMemo(
    () => (sel.agency ? companies.filter((c) => String(c.agency_id) === String(sel.agency)) : (isSuper ? [] : companies)),
    [companies, sel.agency]
  );

  const run = (companyId, p) => {
    if (!companyId) { setData(null); return; }
    const { start, end } = dateRange(p);
    api.reports(token, { company_id: companyId, start, end }).then(setData).catch((e) => setError(e.message));
  };
  const show = () => run(sel.company_id, preset);

  const num = (n) => Number(n || 0).toLocaleString();
  const deviceTotal = data?.devices?.reduce((a, d) => a + Number(d.n), 0) || 0;

  return (
    <div>
      <div className="page-header"><h1>{t('nav.reports')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>{t('rep.subtitle')}</p>
      {error && <p className="error">{error}</p>}

      <div className="panel dash-filter">
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={sel.agency} onChange={(e) => setSel({ agency: e.target.value, company_id: '' })}>
                <option value="">{t('imp.selectAgency')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {(isSuper || isAgency) && (
            <label className="filter-item"><span>{t('common.company')}</span>
              <select value={sel.company_id} onChange={(e) => setSel({ ...sel, company_id: e.target.value })}>
                <option value="">{t('imp.selectCompany')}</option>
                {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="filter-item"><span>{t('lead.received')}</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {DATE_PRESETS.map((p) => <option key={p} value={p}>{t('dp.' + p)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" onClick={show}>{t('dash.show')}</button>
        </div>
      </div>

      {!data || !data.company ? (
        <p className="muted">{t('rep.needCompany')}</p>
      ) : (<>
        <h2>{data.company.name}</h2>

        {/* leads per channel + total */}
        <div className="stat-grid">
          <div className="stat-tile stat-cyan"><div><div className="num">{num(data.total)}</div><div className="lbl">{t('rep.total')}</div></div></div>
          {data.channels.map((c) => {
            const row = data.matrix.find((r) => String(r.service_id) === String(c.id));
            return <div key={c.id} className="stat-tile stat-green"><div><div className="num">{num(row?.total)}</div><div className="lbl">{c.name}</div></div></div>;
          })}
        </div>

        {/* device breakdown */}
        {data.devices.length > 0 && (
          <div className="panel"><h2>{t('rep.devices')}</h2>
            <div className="device-bars">
              {data.devices.map((d, i) => {
                const pct = deviceTotal ? Math.round((Number(d.n) / deviceTotal) * 100) : 0;
                return (
                  <div className="device-bar" key={i}>
                    <div className="device-bar-head"><span>{d.platform}</span><span>{pct}% ({num(d.n)})</span></div>
                    <div className="device-bar-track"><div className="device-bar-fill" style={{ width: pct + '%' }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* campaigns (ad platforms — integration pending) */}
        <div className="panel"><h2>{t('rep.campaigns')}</h2>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>{t('rep.platform')}</th><th>{t('rep.campName')}</th><th>{t('rep.impressions')}</th><th>{t('rep.clicks')}</th><th>{t('rep.budget')}</th></tr></thead>
            <tbody>
              {data.campaigns.length === 0
                ? <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>{t('rep.noData')}</td></tr>
                : data.campaigns.map((c, i) => <tr key={i}><td>{c.platform}</td><td>{c.name}</td><td>{num(c.impressions)}</td><td>{num(c.clicks)}</td><td>{num(c.budget)}₪</td></tr>)}
            </tbody>
          </table></div>
        </div>

        {/* status matrix: channels × statuses */}
        <div className="panel"><h2>{t('rep.statuses')}</h2>
          <div className="table-wrap"><table className="data-table report-matrix">
            <thead><tr>
              <th>{t('rep.channel')}</th>
              {data.statusCols.map((c) => <th key={c.key}>{displayStatus(c.label)}</th>)}
              <th>{t('rep.grandTotal')}</th>
            </tr></thead>
            <tbody>
              {data.matrix.map((r) => (
                <tr key={r.service_id ?? 'none'}>
                  <td>{r.name}</td>
                  {data.statusCols.map((c) => <td key={c.key}>{num(r.counts[c.key])}</td>)}
                  <td><strong>{num(r.total)}</strong></td>
                </tr>
              ))}
              <tr className="matrix-total">
                <td><strong>{t('rep.grandTotal')}</strong></td>
                {data.statusCols.map((c) => <td key={c.key}><strong>{num(data.colTotals[c.key])}</strong></td>)}
                <td><strong>{num(data.total)}</strong></td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </>)}
    </div>
  );
}
