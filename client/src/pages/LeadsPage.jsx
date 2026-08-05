import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function LeadsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ q: '', start: '', end: '' });
  const [error, setError] = useState('');
  const load = (filters) => api.leads(token, filters).then((d) => setRows(d.leads)).catch((e) => setError(e.message));
  useEffect(() => { load({}); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>לידים</h1></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(f); }}>
        <input placeholder="חיפוש שם/טלפון/אימייל" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        <button className="btn btn-primary">הצגה</button>
      </form>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>מס'</th><th>שם הפונה</th><th>טלפון</th><th>חברה</th><th>ערוץ</th><th>נציג</th><th>התקבל</th><th>סטטוס</th></tr></thead>
        <tbody>{rows.map((l) => (
          <tr key={l.id}>
            <td><Link to={`/leads/${l.id}`}>{l.id}</Link></td>
            <td>{l.lead_name || 'לא זמין'}</td><td>{l.lead_phone}</td><td>{l.company_name}</td>
            <td>{l.service_name || '-'}</td><td>{l.agent_name || 'כללי'}</td><td>{l.created_at}</td>
            <td>{l.status_text ? <span className="tag-chip" style={{ background: (l.status_color || '#888') + '22', color: l.status_color || '#555' }}>{l.status_text}</span> : '-'}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">אין לידים.</p>}
    </div>
  );
}
