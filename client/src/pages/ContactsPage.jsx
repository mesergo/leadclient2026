import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function ContactsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const load = (query) => api.contacts(token, { q: query }).then((d) => setRows(d.contacts)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>אנשי קשר</h1></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input placeholder="חיפוש שם/טלפון/אימייל" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-secondary">חיפוש</button>
      </form>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>שם מלא</th><th>טלפון</th><th>אימייל</th><th>תאריך יצירה</th></tr></thead>
        <tbody>{rows.map((c) => (<tr key={c.id}><td>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '-'}</td><td>{c.phone}</td><td>{c.email || '-'}</td><td>{c.created_at}</td></tr>))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">אין אנשי קשר.</p>}
    </div>
  );
}
