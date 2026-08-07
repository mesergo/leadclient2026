import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

export default function CompaniesPage() {
  const { token, user, setImpersonatedSession } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const agencyFilter = sp.get('agency') || '';

  const [companies, setCompanies] = useState([]);
  const [services, setServices] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [error, setError] = useState('');
  const [addingName, setAddingName] = useState('');
  const [showAdd, setShowAdd] = useState(sp.get('add') === '1');
  const [channelDraft, setChannelDraft] = useState({}); // companyId -> new channel name
  const canManage = user?.role === 'super_admin' || user?.role === 'agency_admin';
  const canImpersonate = canManage;

  const loadCompanies = () => api.companies(token).then((d) => setCompanies(d.companies)).catch((e) => setError(e.message));
  const loadServices = () => api.services(token).then((d) => setServices(d.services)).catch(() => {});
  useEffect(() => {
    loadCompanies(); loadServices();
    if (user?.role === 'super_admin') api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
  }, [token]);

  // channels grouped by company
  const channelsByCompany = useMemo(() => {
    const m = {};
    for (const s of services) (m[s.company_id] = m[s.company_id] || []).push(s);
    return m;
  }, [services]);

  // companies grouped by agency (sorted)
  const grouped = useMemo(() => {
    let list = companies;
    if (agencyFilter) list = list.filter((c) => String(c.agency_id) === String(agencyFilter));
    const m = new Map();
    for (const c of list) {
      const key = c.agency_name || '—';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(c);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [companies, agencyFilter]);

  async function addCompany(e) {
    e.preventDefault();
    if (!addingName.trim()) return;
    try { await api.createCompany({ name: addingName.trim(), agency_id: agencyFilter || user?.agency_id }, token); setAddingName(''); setShowAdd(false); loadCompanies(); }
    catch (e) { setError(e.message); }
  }
  async function impersonate(c) {
    if (!confirm(`${t('co.impersonateConfirm')} "${c.name}"?`)) return;
    try { const d = await api.impersonateCompany(c.id, token); setImpersonatedSession(d.token, d.user); location.href = '/'; } catch (e) { setError(e.message); }
  }
  async function toggleCompany(c) {
    try { await api.updateCompany(c.id, { is_active: c.is_active ? 0 : 1 }, token); loadCompanies(); } catch (e) { setError(e.message); }
  }
  async function addChannel(companyId) {
    const name = (channelDraft[companyId] || '').trim();
    if (!name) return;
    try { await api.createService({ company_id: companyId, name }, token); setChannelDraft({ ...channelDraft, [companyId]: '' }); loadServices(); } catch (e) { setError(e.message); }
  }
  async function delChannel(id) {
    if (!confirm(t('co.confirmDelChannel'))) return;
    try { await api.deleteService(id, token); loadServices(); } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('nav.companies')}</h1>
        {canManage && <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}><Icons.Plus size={15} /> {t('co.addBtn')}</button>}
      </div>
      {error && <p className="error">{error}</p>}

      {showAdd && canManage && (
        <form className="inline-form" onSubmit={addCompany}>
          <input placeholder={t('co.newName')} value={addingName} onChange={(e) => setAddingName(e.target.value)} autoFocus />
          <button className="btn btn-primary">{t('common.save')}</button>
        </form>
      )}

      {user?.role === 'super_admin' && (
        <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
          <select value={agencyFilter} onChange={(e) => { const v = e.target.value; setSp(v ? { agency: v } : {}); }}>
            <option value="">{t('co.allAgencies')}</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </form>
      )}

      {grouped.map(([agencyName, comps]) => (
        <div key={agencyName} className="agency-group">
          <h2 className="agency-group-title">{agencyName} <span className="muted">({comps.length})</span></h2>
          <div className="card-grid">
            {comps.map((c) => {
              const channels = channelsByCompany[c.id] || [];
              return (
                <div className="entity-card company-card" key={c.id}>
                  <div className="company-card-head">
                    <div className="company-card-actions">
                      <button className="link-action" onClick={() => nav(`/companies/${c.id}`)}><Icons.Pencil size={13} /> {t('co.edit')}</button>
                      <button className="link-action" onClick={() => nav(`/users?company=${c.id}`)}><Icons.Users size={13} /> {t('co.users')}</button>
                      {canImpersonate && <button className="link-action" onClick={() => impersonate(c)}><Icons.User size={13} /> {t('co.impersonate')}</button>}
                      {canManage && <button className="link-action" onClick={() => toggleCompany(c)}>{c.is_active ? <Icons.Lock size={13} /> : <Icons.Unlock size={13} />}</button>}
                    </div>
                    <h3><Icons.Building size={16} /> {c.name} <span className="muted">({channels.length})</span></h3>
                  </div>
                  <div className="channel-list">
                    {channels.length === 0 && <p className="muted" style={{ fontSize: 12 }}>{t('co.noChannels')}</p>}
                    {channels.map((s) => (
                      <div className="channel-row" key={s.id}>
                        <button className="icon-btn icon-btn--red icon-xs" title="מחיקה" onClick={() => delChannel(s.id)}><Icons.Trash size={13} /></button>
                        <span className="channel-name">{s.name}</span>
                      </div>
                    ))}
                  </div>
                  {canManage && (
                    <form className="channel-add" onSubmit={(e) => { e.preventDefault(); addChannel(c.id); }}>
                      <input placeholder={t('co.channelNamePh')} value={channelDraft[c.id] || ''} onChange={(e) => setChannelDraft({ ...channelDraft, [c.id]: e.target.value })} />
                      <button className="link-action link-action--green"><Icons.Plus size={13} /> {t('co.newChannel')}</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {grouped.length === 0 && <p className="muted">{t('co.none')}</p>}
    </div>
  );
}
