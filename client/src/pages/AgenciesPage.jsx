import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';
import { Check, X, Pencil, Lock } from '../icons';

export default function AgenciesPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const load = () => api.agencies(token).then((d) => setRows(d.agencies)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  async function create(e) { e.preventDefault(); if (!name.trim()) return; try { await api.createAgency(name.trim(), token); setName(''); load(); } catch (e) { setError(e.message); } }
  async function save(id) { try { await api.updateAgency(id, { name: editName }, token); setEditing(null); load(); } catch (e) { setError(e.message); } }
  async function toggle(a) { try { await api.updateAgency(a.id, { is_active: a.is_active ? 0 : 1 }, token); load(); } catch (e) { setError(e.message); } }
  return (
    <div>
      <div className="page-header"><h1>{t('nav.agencies')}</h1></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={create}>
        <input placeholder={t('ag.newName')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary">{t('ag.addBtn')}</button>
      </form>
      <div className="card-grid">
        {rows.map((a) => (
          <div className="entity-card" key={a.id}>
            <div className="entity-card-head">
              {a.logo_url && <img className="entity-card-logo" src={API_ORIGIN + a.logo_url} alt="" />}
              {editing === a.id ? <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus /> : <h3>{a.name}</h3>}
              <span className={'status-pill ' + (a.is_active ? 'active' : 'inactive')}>{a.is_active ? t('common.active') : t('common.suspended')}</span>
            </div>
            <dl className="entity-card-stats"><div><dt>{t('ag.companies')}</dt><dd>{a.companies_count}</dd></div><div><dt>IVR</dt><dd style={{ fontSize: 12 }}>{a.ivr_provider}</dd></div></dl>
            <div className="entity-card-actions">
              {editing === a.id ? (
                <><button className="icon-btn icon-btn--green" onClick={() => save(a.id)}><Check size={15} /></button>
                <button className="icon-btn" onClick={() => setEditing(null)}><X size={15} /></button></>
              ) : (
                <><button className="icon-btn icon-btn--cyan" onClick={() => { setEditing(a.id); setEditName(a.name); }}><Pencil size={15} /></button>
                <button className="icon-btn icon-btn--red" onClick={() => toggle(a)}><Lock size={15} /></button></>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">{t('ag.none')}</p>}
      </div>
    </div>
  );
}
