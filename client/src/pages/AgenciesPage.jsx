import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';
import { Building, Lock, Unlock, Pencil, Plus } from '../icons';

export default function AgenciesPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.agencies(token, { q, status }).then((d) => setRows(d.agencies)).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token, status]);

  async function create(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try { await api.createAgency(newName.trim(), token); setNewName(''); setAdding(false); load(); }
    catch (e) { setError(e.message); }
  }
  async function toggle(a) {
    try { await api.updateAgency(a.id, { is_active: a.is_active ? 0 : 1 }, token); load(); }
    catch (e) { setError(e.message); }
  }

  const stat = (label, val) => (
    <div className="ag-stat"><span className="ag-stat-label">{label}:</span> <span className="ag-stat-val">{Number(val).toLocaleString()}</span></div>
  );

  return (
    <div>
      <div className="page-header">
        <h1>{t('nav.agencies')}</h1>
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}><Plus size={15} /> {t('ag.addBtn')}</button>
      </div>
      {error && <p className="error">{error}</p>}

      {adding && (
        <form className="inline-form" onSubmit={create}>
          <input placeholder={t('ag.newName')} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button className="btn btn-primary">{t('common.save')}</button>
        </form>
      )}

      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder={t('ag.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('ag.filterAll')}</option>
          <option value="active">{t('ag.filterActive')}</option>
          <option value="suspended">{t('ag.filterSuspended')}</option>
        </select>
        <button className="btn btn-secondary">{t('common.search')}</button>
      </form>

      <div className="card-grid ag-grid">
        {rows.map((a) => (
          <div className="entity-card ag-card" key={a.id}>
            <div className="ag-card-head">
              {a.logo_url ? <img className="ag-logo" src={API_ORIGIN + a.logo_url} alt="" /> : null}
              <h3>{a.name}</h3>
              {!a.is_active && <span className="status-pill inactive">{t('common.suspended')}</span>}
            </div>
            <div className="ag-stats">
              {stat(t('ag.companies'), a.companies_count)}
              {stat(t('ag.channels'), a.services_count)}
              {stat(t('ag.users'), a.users_count)}
              {stat(t('ag.leads'), a.leads_count)}
              {stat(t('ag.phones'), a.phones_count)}
            </div>
            <div className="ag-actions">
              <Link className="icon-btn icon-btn--amber" title={t('ag.toCompanies')} to={`/companies?agency=${a.id}`}><Building size={15} /></Link>
              <button className={'icon-btn ' + (a.is_active ? 'icon-btn--red' : 'icon-btn--green')} title={a.is_active ? t('ag.suspend') : t('ag.activate')} onClick={() => toggle(a)}>
                {a.is_active ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
              <Link className="icon-btn icon-btn--green" title={t('ag.edit')} to={`/agencies/${a.id}`}><Pencil size={15} /></Link>
              <Link className="icon-btn icon-btn--green" title={t('ag.addCompany')} to={`/companies?agency=${a.id}&add=1`}><Plus size={15} /></Link>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">{t('ag.none')}</p>}
      </div>
    </div>
  );
}
