import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function LeadsPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ q: '', start: '', end: '' });
  const [error, setError] = useState('');
  const load = (filters) => api.leads(token, filters).then((d) => setRows(d.leads)).catch((e) => setError(e.message));
  useEffect(() => { load({}); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>{t('nav.leads')}</h1></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(f); }}>
        <input placeholder={t('lead.searchPh')} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        <button className="btn btn-primary">{t('lead.show')}</button>
      </form>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('lead.num')}</th><th>{t('lead.name')}</th><th>{t('common.phone')}</th><th>{t('common.company')}</th><th>{t('lead.channel')}</th><th>{t('lead.agent')}</th><th>{t('lead.received')}</th><th>{t('common.status')}</th></tr></thead>
        <tbody>{rows.map((l) => (
          <tr key={l.id}>
            <td><Link to={`/leads/${l.id}`}>{l.id}</Link></td>
            <td>{l.lead_name || t('lead.na')}</td><td>{l.lead_phone}</td><td>{l.company_name}</td>
            <td>{l.service_name || '-'}</td><td>{l.agent_name || t('lead.general')}</td><td>{l.created_at}</td>
            <td>{l.status_text ? <span className="tag-chip" style={{ background: (l.status_color || '#888') + '22', color: l.status_color || '#555' }}>{l.status_text}</span> : '-'}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('lead.none')}</p>}
    </div>
  );
}
