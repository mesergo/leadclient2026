import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { Star } from '../icons';

export default function LeadDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = () => api.lead(id, token).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);
  async function rate(n) { try { await api.updateLead(id, { lead_rating: n }, token); load(); } catch (e) { setError(e.message); } }
  async function addNote(e) { e.preventDefault(); if (!note.trim()) return; try { await api.addNote(id, { content: note.trim() }, token); setNote(''); load(); } catch (e) { setError(e.message); } }
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  const l = data.lead;
  return (
    <div>
      <div className="page-header"><h1>{t('leadd.title')} #{l.id}</h1><Link className="btn btn-secondary" to="/leads">{t('common.back')}</Link></div>
      <div className="panel">
        <div className="form-field"><label>{t('lead.name')}</label><div>{l.lead_name || t('lead.na')}</div></div>
        <div className="form-field"><label>{t('common.phone')}</label><div>{l.lead_phone}</div></div>
        <div className="form-field"><label>{t('common.email')}</label><div>{l.lead_email || '--'}</div></div>
        <div className="form-field"><label>{t('common.company')}</label><div>{l.company_name}</div></div>
        <div className="form-field"><label>{t('common.status')}</label><div>{l.status_text || '-'}</div></div>
        <div className="form-field"><label>{t('leadd.rating')}</label><div style={{ display: 'flex', gap: 2, color: '#f5a623' }}>
          {[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ cursor: 'pointer' }} onClick={() => rate(n)}><Star size={18} filled={n <= (l.lead_rating || 0)} /></span>)}
        </div></div>
      </div>
      <div className="panel">
        <h2>{t('leadd.convos')}</h2>
        <form className="inline-form" onSubmit={addNote}>
          <input placeholder={t('leadd.addNote')} value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary">{t('common.add')}</button>
        </form>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t('leadd.content')}</th><th>{t('leadd.type')}</th><th>{t('common.date')}</th></tr></thead>
          <tbody>{(data.conversations || []).map((c) => (<tr key={c.id}><td>{c.content}</td><td>{c.comment || c.send_by}</td><td>{c.created_at}</td></tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}
