import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { dateRange, DATE_PRESETS } from '../dates';
import * as Icons from '../icons';

export default function DashboardPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const isSuper = user?.role === 'super_admin';

  // filter state
  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [services, setServices] = useState([]);
  const [filters, setFilters] = useState({ agency: '', company: '', service: '', preset: 'today' });

  // data
  const [summary, setSummary] = useState(null);
  const [byAgency, setByAgency] = useState([]);
  const [online, setOnline] = useState({ online: [], inCall: [] });
  const [recent, setRecent] = useState([]);
  const [sort, setSort] = useState({ col: 'leads_count', dir: 'desc' });
  const [error, setError] = useState('');

  // load filter option lists
  useEffect(() => {
    api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
  }, [token]);

  // companies filtered by chosen agency
  const agencyCompanies = useMemo(
    () => (filters.agency ? companies.filter((c) => String(c.agency_id) === String(filters.agency)) : companies),
    [companies, filters.agency]
  );

  // channels for chosen company
  useEffect(() => {
    if (filters.company) api.services(token, filters.company).then((d) => setServices(d.services)).catch(() => setServices([]));
    else setServices([]);
  }, [filters.company, token]);

  function run() {
    const { start, end } = dateRange(filters.preset);
    const q = { start, end, agency: filters.agency, company: filters.company, service: filters.service };
    setError('');
    api.dashboardSummary(token, q).then(setSummary).catch((e) => setError(e.message));
    api.dashboardByAgency(token, { start, end }).then((d) => setByAgency(d.agencies)).catch(() => {});
    api.dashboardOnline(token).then(setOnline).catch(() => {});
    api.dashboardRecent(token).then((d) => setRecent(d.actions || [])).catch(() => {});
  }
  useEffect(() => { run(); /* initial */ }, [token]);

  const leadsLink = useMemo(() => {
    const { start, end } = dateRange(filters.preset);
    const params = Object.entries({ start, end, agency: filters.agency, company_id: filters.company, service_id: filters.service }).filter(([, v]) => v);
    return '/leads?' + new URLSearchParams(params).toString();
  }, [filters]);

  const tiles = summary ? [
    { lbl: t('dash.agencies'), num: summary.agencies, cls: 'stat-cyan', Icon: Icons.Building },
    { lbl: t('dash.companies'), num: summary.companies, cls: 'stat-green', Icon: Icons.Building },
    { lbl: t('dash.users'), num: summary.users, cls: 'stat-amber', Icon: Icons.Users },
    { lbl: t('dash.leads'), num: summary.leads, cls: 'stat-pink', Icon: Icons.Inbox, to: leadsLink },
    { lbl: t('dash.conversion'), num: summary.conversion + '%', cls: 'stat-gold', Icon: Icons.Chart },
  ] : [];

  const sortedAgencies = useMemo(() => {
    const arr = byAgency.filter((a) => Number(a.leads_count) > 0); // only agencies with leads
    const { col, dir } = sort;
    arr.sort((a, b) => {
      let av = a[col], bv = b[col];
      if (col === 'name') return dir === 'asc' ? String(av).localeCompare(bv) : String(bv).localeCompare(av);
      av = Number(av); bv = Number(bv);
      return dir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [byAgency, sort]);

  const th = (col, label) => (
    <th style={{ cursor: 'pointer' }} onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}>
      {label} {sort.col === col ? (sort.dir === 'desc' ? '▾' : '▴') : ''}
    </th>
  );

  return (
    <div>
      <div className="page-header"><h1>{t('dash.greeting')}</h1></div>

      {/* filter bar */}
      <div className="panel dash-filter">
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item">
              <span>{t('dash.selectAgency')}</span>
              <select value={filters.agency} onChange={(e) => setFilters({ ...filters, agency: e.target.value, company: '', service: '' })}>
                <option value="">{t('dash.allAgencies')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          <label className="filter-item">
            <span>{t('dash.company')}</span>
            <select value={filters.company} onChange={(e) => setFilters({ ...filters, company: e.target.value, service: '' })}>
              <option value="">{t('dash.allCompanies')}</option>
              {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="filter-item">
            <span>{t('dash.channel')}</span>
            <select value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })} disabled={!filters.company}>
              <option value="">{t('dash.allChannels')}</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="filter-item">
            <span>&nbsp;</span>
            <select value={filters.preset} onChange={(e) => setFilters({ ...filters, preset: e.target.value })}>
              {DATE_PRESETS.map((p) => <option key={p} value={p}>{t('dp.' + p)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" onClick={run}>{t('dash.show')}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {/* KPI tiles */}
      <h2 className="section-title">{t('dash.generalInfo')}</h2>
      <div className="stat-grid">
        {tiles.map((ti) => {
          const inner = (
            <>
              <div><div className="num">{typeof ti.num === 'number' ? ti.num.toLocaleString() : ti.num}</div><div className="lbl">{ti.lbl}</div></div>
              <ti.Icon size={34} />
            </>
          );
          return ti.to
            ? <Link className={'stat-tile stat-tile-link ' + ti.cls} key={ti.lbl} to={ti.to}>{inner}</Link>
            : <div className={'stat-tile ' + ti.cls} key={ti.lbl}>{inner}</div>;
        })}
      </div>

      {/* agency breakdown table */}
      <div className="panel">
        <div className="table-wrap"><table className="data-table">
          <thead><tr>
            {th('name', t('dash.tblAgency'))}
            {th('companies_count', t('dash.tblCompanies'))}
            {th('users_count', t('dash.tblUsers'))}
            {th('leads_count', t('dash.tblLeads'))}
            {th('conversion', t('dash.tblConv'))}
          </tr></thead>
          <tbody>{sortedAgencies.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.companies_count}</td>
              <td>{a.users_count}</td>
              <td>{Number(a.leads_count).toLocaleString()}</td>
              <td>{a.conversion}%</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      {/* online users + recent activity */}
      <div className="dash-bottom">
        <div className="panel dash-online">
          <h3><span className="dot dot-green" /> {t('dash.online')} ({online.online.length})</h3>
          {online.online.length === 0 ? <p className="muted">{t('dash.noOnline')}</p>
            : online.online.map((u) => <div key={u.id} className="online-user">{u.display_name}</div>)}
          <h3 style={{ marginTop: '1rem' }}><span className="dot dot-amber" /> {t('dash.inCall')} ({online.inCall.length})</h3>
        </div>
        <div className="panel dash-recent">
          <div className="dash-recent-head">
            <h3>{t('dash.recent')}</h3>
            <Link to="/actions" className="btn-secondary btn-sm">{t('dash.allActions')}</Link>
          </div>
          {recent.length === 0 ? <p className="muted">{t('dash.empty')}</p> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t('dash.action')}</th><th>{t('dash.user')}</th><th>{t('dash.date')}</th></tr></thead>
              <tbody>{recent.slice(0, 10).map((a) => (<tr key={a.id}><td>{a.content}</td><td>{a.user_name}</td><td>{a.created_at}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}
