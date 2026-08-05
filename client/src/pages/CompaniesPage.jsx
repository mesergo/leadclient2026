import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';
import * as Icons from '../icons';

export default function CompaniesPage() {
  const { token, user, setImpersonatedSession } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const canImpersonate = user?.role === 'super_admin' || user?.role === 'agency_admin';
  const load = () => api.companies(token).then((d) => setRows(d.companies)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  async function create(e) { e.preventDefault(); if (!name.trim()) return; try { await api.createCompany({ name: name.trim(), agency_id: user?.agency_id }, token); setName(''); load(); } catch (e) { setError(e.message); } }
  async function impersonate(c) { if (!confirm(`${t('co.impersonateConfirm')} "${c.name}"?`)) return; try { const d = await api.impersonateCompany(c.id, token); setImpersonatedSession(d.token, d.user); location.href = '/'; } catch (e) { setError(e.message); } }
  return (
    <div>
      <div className="page-header"><h1>{t('nav.companies')}</h1></div>
      {error && <p className="error">{error}</p>}
      {(user?.role === 'super_admin' || user?.role === 'agency_admin') && (
        <form className="inline-form" onSubmit={create}>
          <input placeholder={t('co.newName')} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary">{t('co.addBtn')}</button>
        </form>
      )}
      <div className="card-grid">
        {rows.map((c) => (
          <div className="entity-card" key={c.id}>
            <div className="entity-card-head">
              {c.logo_url && <img className="entity-card-logo" src={API_ORIGIN + c.logo_url} alt="" />}
              <h3>{c.name}</h3>
              <span className={'status-pill ' + (c.is_active ? 'active' : 'inactive')}>{c.is_active ? t('common.active') : t('common.suspended')}</span>
            </div>
            <dl className="entity-card-stats"><div><dt>{t('common.agency')}</dt><dd style={{ fontSize: 12 }}>{c.agency_name || '-'}</dd></div><div><dt>{t('co.channels')}</dt><dd>{c.services_count}</dd></div></dl>
            <div className="entity-card-actions">
              <Link className="icon-btn icon-btn--cyan" to={`/companies/${c.id}`}><Icons.Pencil size={15} /></Link>
              {canImpersonate && <button className="icon-btn" onClick={() => impersonate(c)}><Icons.Swap size={15} /></button>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">{t('co.none')}</p>}
      </div>
    </div>
  );
}
