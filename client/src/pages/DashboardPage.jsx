import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import * as Icons from '../icons';

export default function DashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([api.dashboardSummary(token), api.dashboardRecent(token)]).then(([s, r]) => {
      if (s.status === 'fulfilled') setSummary(s.value);
      else setError(s.reason.message);
      if (r.status === 'fulfilled') setRecent(r.value.actions || []);
    });
  }, [token]);

  const tiles = summary ? [
    { lbl: 'סוכנויות', num: summary.agencies, cls: 'stat-cyan', Icon: Icons.Building },
    { lbl: 'חברות', num: summary.companies, cls: 'stat-green', Icon: Icons.Building },
    { lbl: 'משתמשים', num: summary.users, cls: 'stat-amber', Icon: Icons.Users },
    { lbl: 'לידים', num: summary.leads, cls: 'stat-pink', Icon: Icons.Inbox },
    { lbl: 'המרות', num: summary.conversion + '%', cls: 'stat-gold', Icon: Icons.Chart },
  ] : [];

  return (
    <div>
      <div className="page-header"><h1>שלום! ברוכים הבאים למערכת ניהול הלידים</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="stat-grid">
        {tiles.map((t) => (
          <div className={'stat-tile ' + t.cls} key={t.lbl}>
            <div><div className="num">{t.num}</div><div className="lbl">{t.lbl}</div></div>
            <t.Icon size={34} />
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>פעולות אחרונות</h2>
        {recent.length === 0 ? <p className="muted">אין פעילות להצגה.</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>פעולה</th><th>משתמש</th><th>תאריך</th></tr></thead>
            <tbody>{recent.map((a) => (<tr key={a.id}><td>{a.content}</td><td>{a.user_name}</td><td>{a.created_at}</td></tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
