import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

// Extra companies of a user who works in several companies (super / agency admin only).
// The user then switches between them from the header ("מחובר ל: …") or views all together.
export default function UserCompaniesPanel({ userId, primaryCompanyId, userRole }) {
  const { token, user: me } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [add, setAdd] = useState({ company_id: '', role: 'company_user' });
  const [error, setError] = useState('');
  const allowed = me && ['super_admin', 'agency_admin'].includes(me.role) && ['company_admin', 'company_user'].includes(userRole);

  const load = () => api.userCompanies(userId, token).then((d) => setRows(d.companies || [])).catch((e) => setError(e.message));
  useEffect(() => {
    if (!allowed) return;
    load();
    api.companies(token).then((d) => setCompanies(d.companies || d || [])).catch(() => {});
  }, [userId, token, allowed]);
  if (!allowed) return null;

  const taken = new Set([String(primaryCompanyId), ...rows.map((r) => String(r.company_id))]);
  async function addCompany() {
    setError('');
    if (!add.company_id) return setError(t('uc.pick'));
    try { await api.addUserCompany(userId, add, token); setAdd({ company_id: '', role: 'company_user' }); load(); } catch (e) { setError(e.message); }
  }
  async function remove(cid) {
    if (!window.confirm(t('uc.confirmRemove'))) return;
    try { await api.removeUserCompany(userId, cid, token); load(); } catch (e) { setError(e.message); }
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h2>{t('uc.title')}</h2>
      <p className="muted">{t('uc.hint')}</p>
      {error && <p className="error">{error}</p>}
      {rows.length === 0 ? <p className="muted">{t('uc.none')}</p> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t('uc.company')}</th><th>{t('uc.role')}</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.company_id}>
              <td>{r.company_name}</td>
              <td>{r.role === 'company_admin' ? t('uc.roleAdmin') : t('uc.roleAgent')}</td>
              <td><button className="link-action" onClick={() => remove(r.company_id)}>{t('uc.remove')}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        <select value={add.company_id} onChange={(e) => setAdd({ ...add, company_id: e.target.value })}>
          <option value="">{t('uc.pick')}</option>
          {companies.filter((c) => !taken.has(String(c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
          <option value="company_user">{t('uc.roleAgent')}</option>
          <option value="company_admin">{t('uc.roleAdmin')}</option>
        </select>
        <button className="btn btn-primary" onClick={addCompany}>{t('uc.add')}</button>
      </div>
    </div>
  );
}
