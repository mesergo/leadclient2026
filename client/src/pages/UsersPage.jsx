import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function UsersPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const load = (query) => api.users(token, { q: query }).then((d) => setRows(d.users)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>משתמשים</h1></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input placeholder="חיפוש שם/אימייל" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-secondary">חיפוש</button>
      </form>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>שם</th><th>שם משתמש</th><th>אימייל</th><th>חברה</th><th>תפקיד</th><th>נראה לאחרונה</th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id}><td>{u.display_name}</td><td>{u.username}</td><td>{u.email || '-'}</td><td>{u.company_name || '-'}</td><td>{u.role}</td><td>{u.last_seen_at || '--'}</td></tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">אין משתמשים.</p>}
    </div>
  );
}
