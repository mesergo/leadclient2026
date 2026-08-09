import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';
import { formatIL } from '../phone';

export default function ContactsPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const isSuper = user?.role === 'super_admin';
  const isAgency = user?.role === 'agency_admin';

  const [rows, setRows] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [flt, setFlt] = useState({ agency: '', company_id: '', q: '' });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ first_name: '', phone: '', email: '' });
  const [error, setError] = useState('');

  const load = (f = flt) => api.contacts(token, { agency: f.agency || undefined, company_id: f.company_id || undefined, q: f.q || undefined })
    .then((d) => setRows(d.contacts)).catch((e) => setError(e.message));

  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    if (isSuper || isAgency) api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
    load();
  }, [token]);

  const agencyCompanies = useMemo(
    () => (flt.agency ? companies.filter((c) => String(c.agency_id) === String(flt.agency)) : (isSuper ? [] : companies)),
    [companies, flt.agency]
  );
  const setF = (p) => { const f = { ...flt, ...p }; setFlt(f); load(f); };
  const activeCompany = isSuper || isAgency ? flt.company_id : user?.company_id;

  async function create(e) {
    e.preventDefault();
    if (!activeCompany) return setError(t('imp.needCompany'));
    if (!draft.phone && !draft.email) return;
    try {
      await api.createContact({ company_id: activeCompany, ...draft }, token);
      setDraft({ first_name: '', phone: '', email: '' }); setAdding(false); load();
    } catch (er) { setError(er.message); }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('nav.contacts')}</h1>
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}><Icons.Plus size={14} /> {t('con.add')}</button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel dash-filter">
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={flt.agency} onChange={(e) => setF({ agency: e.target.value, company_id: '' })}>
                <option value="">{t('common.all')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          )}
          {(isSuper || isAgency) && (
            <label className="filter-item"><span>{t('common.company')}</span>
              <select value={flt.company_id} onChange={(e) => setF({ company_id: e.target.value })}>
                <option value="">{t('common.all')}</option>
                {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          )}
          <form className="filter-item" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <span>{t('common.search')}</span>
            <input placeholder={t('con.searchPh')} value={flt.q} onChange={(e) => setFlt({ ...flt, q: e.target.value })} />
          </form>
        </div>
      </div>

      {adding && (
        <form className="panel inline-form" onSubmit={create}>
          <input placeholder={t('con.firstName')} value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} />
          <input placeholder={t('common.phone')} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <input placeholder={t('common.email')} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <button className="btn btn-primary" disabled={!activeCompany}>{t('con.create')}</button>
        </form>
      )}

      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          <th>{t('con.fullName')}</th><th>{t('common.phone')}</th><th>{t('common.email')}</th>
          {(isSuper || isAgency) && <th>{t('common.company')}</th>}<th>{t('con.created')}</th>
        </tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id}>
            <td><button className="link-name" onClick={() => nav(`/contacts/${c.id}`)}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</button></td>
            <td>{formatIL(c.phone) || '-'}</td><td>{c.email || '-'}</td>
            {(isSuper || isAgency) && <td>{c.company_name || '-'}</td>}
            <td>{c.created_at}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('con.none')}</p>}
    </div>
  );
}
