import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function VirtualPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const load = () => api.virtual(token).then((d) => setRows(d.numbers)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>מספרים וירטואליים</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>מספר וירטואלי</th><th>יעד</th><th>ספק IVR</th><th>חברה</th><th>פרימיום</th></tr></thead>
        <tbody>{rows.map((n) => (<tr key={n.id}><td>{n.phone_number}</td><td>{n.redirect_to_number || '-'}</td><td>{n.ivr_provider}</td><td>{n.company_name || '-'}</td><td>{n.is_premium ? 'כן' : 'לא'}</td></tr>))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">אין מספרים.</p>}
    </div>
  );
}
