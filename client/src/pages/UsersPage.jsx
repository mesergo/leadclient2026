import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';
import { timeAgo, isRecent } from '../timeago';

const ROLES = ['super_admin', 'agency_admin', 'company_admin', 'company_user', 'translator'];
const ROLE_LABELS = {
  he: { super_admin: 'מנהל על', agency_admin: 'מנהל סוכנות', company_admin: 'מנהל חברה', company_user: 'משתמש', translator: 'מתרגם' },
  en: { super_admin: 'Super admin', agency_admin: 'Agency admin', company_admin: 'Company admin', company_user: 'User', translator: 'Translator' },
};

export default function UsersPage() {
  const { token, user, startImpersonation } = useAuth();
  const { t, lang } = useLang();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const isSuper = user?.role === 'super_admin';
  const isAgency = user?.role === 'agency_admin';
  const canReassign = isSuper || isAgency;

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [flt, setFlt] = useState({ agency: '', company_id: sp.get('company') || '', role: '', suspended: '', q: '' });
  const [editCompanyId, setEditCompanyId] = useState(null); // user id whose company is being edited
  const [editRoleId, setEditRoleId] = useState(null);
  const [error, setError] = useState('');

  const load = (f = flt) => api.users(token, {
    agency: f.agency || undefined, company_id: f.company_id || undefined,
    role: f.role || undefined, suspended: f.suspended || undefined, q: f.q || undefined,
  }).then((d) => { setRows(d.users); setStats(d.stats); }).catch((e) => setError(e.message));

  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    if (canReassign) api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
    load();
  }, [token]);

  const agencyCompanies = useMemo(
    () => (flt.agency ? companies.filter((c) => String(c.agency_id) === String(flt.agency)) : (isSuper ? [] : companies)),
    [companies, flt.agency]
  );
  const roleLabel = (r) => (ROLE_LABELS[lang] || ROLE_LABELS.he)[r] || r;
  const patch = async (id, body) => { try { await api.updateUser(id, body, token); load(); } catch (e) { setError(e.message); } };
  const impersonate = async (u) => {
    try { const d = await api.impersonate(u.id, token); startImpersonation(d.token, d.user, user?.name || user?.display_name || 'admin'); nav('/'); }
    catch (e) { setError(e.message); }
  };
  const num = (n) => Number(n || 0).toLocaleString();
  const setF = (patchF) => { const f = { ...flt, ...patchF }; setFlt(f); load(f); };

  const lastSeen = (u) => {
    if (isRecent(u.last_seen_at)) return <span className="online-now"><span className="online-dot" /> {t('usr.onlineNow')}</span>;
    return timeAgo(u.last_seen_at, t) || '--';
  };

  return (
    <div>
      <div className="page-header"><h1>{t('nav.users')}</h1></div>
      {error && <p className="error">{error}</p>}

      {stats && (
        <div className="stat-grid">
          <div className="stat-tile stat-cyan"><div><div className="num">{num(stats.total)}</div><div className="lbl">{t('usr.total')}</div></div></div>
          <div className="stat-tile stat-green"><div><div className="num">{num(stats.online)}</div><div className="lbl">{t('usr.online')}</div></div></div>
          <div className="stat-tile stat-amber"><div><div className="num">{num(stats.never_logged)}</div><div className="lbl">{t('usr.neverLogged')}</div></div></div>
          <div className="stat-tile stat-pink"><div><div className="num">{num(stats.google)}</div><div className="lbl">{t('usr.google')}</div></div></div>
        </div>
      )}

      <div className="panel dash-filter">
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={flt.agency} onChange={(e) => setF({ agency: e.target.value, company_id: '' })}>
                <option value="">{t('common.all')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {canReassign && (
            <label className="filter-item"><span>{t('common.company')}</span>
              <select value={flt.company_id} onChange={(e) => setF({ company_id: e.target.value })}>
                <option value="">{t('common.all')}</option>
                {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="filter-item"><span>{t('usr.role')}</span>
            <select value={flt.role} onChange={(e) => setF({ role: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </label>
          <label className="filter-item"><span>{t('usr.suspendedFilter')}</span>
            <select value={flt.suspended} onChange={(e) => setF({ suspended: e.target.value })}>
              <option value="">{t('common.all')}</option>
              <option value="active">{t('usr.activeOnly')}</option>
              <option value="suspended">{t('usr.suspendedOnly')}</option>
            </select>
          </label>
          <form className="filter-item" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <span>{t('common.search')}</span>
            <input placeholder={t('usr.searchPh')} value={flt.q} onChange={(e) => setFlt({ ...flt, q: e.target.value })} />
          </form>
        </div>
      </div>

      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          <th>{t('common.name')}</th><th>{t('usr.username')}</th><th>{t('common.email')}</th>
          <th>{t('common.agency')}</th><th>{t('common.company')}</th><th>{t('usr.role')}</th>
          <th>{t('usr.lastSeen')}</th><th>{t('usr.active')}</th><th>{t('usr.actions')}</th>
        </tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id} className={u.is_active ? '' : 'row-suspended'}>
            <td><button className="link-name" onClick={() => nav(`/users/${u.id}/edit`)}>{u.display_name || u.username}</button></td>
            <td>{u.username}</td><td>{u.email || '-'}</td>
            <td>{u.agency_name || '-'}</td>
            <td>
              {canReassign && editCompanyId === u.id ? (
                <select className="cell-select" autoFocus value={u.company_id || ''}
                  onChange={(e) => { patch(u.id, { company_id: e.target.value || null }); setEditCompanyId(null); }}
                  onBlur={() => setEditCompanyId(null)}>
                  <option value="">—</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <span className="cell-editable">
                  {u.company_name || '-'}
                  {canReassign && <button className="cell-edit-btn" title={t('co.edit')} onClick={() => setEditCompanyId(u.id)}><Icons.Pencil size={12} /></button>}
                </span>
              )}
            </td>
            <td>
              {isSuper && editRoleId === u.id ? (
                <select className="cell-select" autoFocus value={u.role}
                  onChange={(e) => { patch(u.id, { role: e.target.value }); setEditRoleId(null); }}
                  onBlur={() => setEditRoleId(null)}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              ) : (
                <span className="cell-editable">
                  {roleLabel(u.role)}
                  {isSuper && <button className="cell-edit-btn" title={t('co.edit')} onClick={() => setEditRoleId(u.id)}><Icons.Pencil size={12} /></button>}
                </span>
              )}
            </td>
            <td>{lastSeen(u)}</td>
            <td>
              <label className="switch-sm">
                <input type="checkbox" checked={!!u.is_active} onChange={(e) => patch(u.id, { is_active: e.target.checked ? 1 : 0 })} />
              </label>
            </td>
            <td>
              <button className="link-action" title={t('usr.loginAs')} onClick={() => impersonate(u)}><Icons.User size={13} /> {t('usr.loginAs')}</button>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('usr.none')}</p>}
    </div>
  );
}
