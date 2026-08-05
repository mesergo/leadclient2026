import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function LanguagePage() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.languages(token).then((d) => setRows(d.languages)).catch((e) => setError(e.message)); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>תרגומי מערכת</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>שפה</th><th>אנגלית</th><th>כיוון</th><th>פעיל</th></tr></thead>
        <tbody>{rows.map((l) => (<tr key={l.slug}><td>{l.language}</td><td>{l.language_english}</td><td>{l.is_rtl ? 'RTL' : 'LTR'}</td><td>{l.is_active ? 'כן' : 'לא'}</td></tr>))}</tbody>
      </table></div>
    </div>
  );
}
