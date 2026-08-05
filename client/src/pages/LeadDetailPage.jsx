import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Star } from '../icons';

export default function LeadDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = () => api.lead(id, token).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);

  async function rate(n) { try { await api.updateLead(id, { lead_rating: n }, token); load(); } catch (e) { setError(e.message); } }
  async function addNote(e) { e.preventDefault(); if (!note.trim()) return; try { await api.addNote(id, { content: note.trim() }, token); setNote(''); load(); } catch (e) { setError(e.message); } }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">טוען...</p>;
  const l = data.lead;
  return (
    <div>
      <div className="page-header"><h1>ליד #{l.id}</h1><Link className="btn btn-secondary" to="/leads">חזרה</Link></div>
      <div className="panel">
        <div className="form-field"><label>שם הפונה</label><div>{l.lead_name || 'לא זמין'}</div></div>
        <div className="form-field"><label>טלפון</label><div>{l.lead_phone}</div></div>
        <div className="form-field"><label>אימייל</label><div>{l.lead_email || '--'}</div></div>
        <div className="form-field"><label>חברה</label><div>{l.company_name}</div></div>
        <div className="form-field"><label>סטטוס</label><div>{l.status_text || '-'}</div></div>
        <div className="form-field"><label>דירוג</label><div style={{ display: 'flex', gap: 2, color: '#f5a623' }}>
          {[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ cursor: 'pointer' }} onClick={() => rate(n)}><Star size={18} filled={n <= (l.lead_rating || 0)} /></span>)}
        </div></div>
      </div>
      <div className="panel">
        <h2>שיחות והערות</h2>
        <form className="inline-form" onSubmit={addNote}>
          <input placeholder="הוספת הערה..." value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary">הוסף</button>
        </form>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>תוכן</th><th>סוג</th><th>תאריך</th></tr></thead>
          <tbody>{(data.conversations || []).map((c) => (<tr key={c.id}><td>{c.content}</td><td>{c.comment || c.send_by}</td><td>{c.created_at}</td></tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}
