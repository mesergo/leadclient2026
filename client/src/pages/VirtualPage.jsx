import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { dateRange, DATE_PRESETS } from '../dates';

export default function VirtualPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [preset, setPreset] = useState('thisMonth');
  const [sort, setSort] = useState({ col: 'agency_name', dir: 'asc' });
  const [error, setError] = useState('');

  const load = (p) => {
    const { start, end } = dateRange(p);
    api.virtual(token, { start, end }).then((d) => setRows(d.numbers)).catch((e) => setError(e.message));
  };
  useEffect(() => { load(preset); }, [token]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const { col, dir } = sort;
    arr.sort((a, b) => {
      let av = a[col] ?? '', bv = b[col] ?? '';
      if (col === 'leads_count') { av = Number(av); bv = Number(bv); return dir === 'asc' ? av - bv : bv - av; }
      return dir === 'asc' ? String(av).localeCompare(bv) : String(bv).localeCompare(av);
    });
    return arr;
  }, [rows, sort]);

  const th = (col, label) => (
    <th style={{ cursor: 'pointer' }} onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label} {sort.col === col ? (sort.dir === 'asc' ? '▴' : '▾') : ''}
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
