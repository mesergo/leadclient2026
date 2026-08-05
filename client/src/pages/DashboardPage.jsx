import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

export default function DashboardPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([api.dashboardSummary(token), api.dashboardRecent(token)]).then(([s, r]) => {
      if (s.status === 'fulfilled') setSummary(s.value); else setError(s.reason.message);
      if (r.status === 'fulfilled') setRecent(r.value.actions || []);
    });
  }, [token]);

  const tiles = summary ? [
    { lbl: t('dash.agencies'), num: summary.agencies, cls: 'stat-cyan', Icon: Icons.Building },
    { lbl: t('dash.companies'), num: summary.companies, cls: 'stat-green', Icon: Icons.Building },
    { lbl: t('dash.users'), num: summary.users, cls: 'stat-amber', Icon: Icons.Users },
    { lbl: t('dash.leads'), num: summary.leads, cls: 'stat-pink', Icon: Icons.Inbox },
    { lbl: t('dash.conversion'), num: summary.conversion + '%', cls: 'stat-gold', Icon: Icons.Chart },
  ] : [];

  return (
    <div>
      <div className="page-header"><h1>{t('dash.greeting')}</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="stat-grid">
        {tiles.map((ti) => (
          <div className={'stat-tile ' + ti.cls} key={ti.lbl}>
            <div><div className="num">{ti.num}</div><div className="lbl">{ti.lbl}</div></div>
            <ti.Icon size={34} />
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>{t('dash.recent')}</h2>
        {recent.length === 0 ? <p className="muted">{t('dash.empty')}</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>{t('dash.action')}</th><th>{t('dash.user')}</th><th>{t('dash.date')}</th></tr></thead>
            <tbody>{recent.map((a) => (<tr key={a.id}><td>{a.content}</td><td>{a.user_name}</td><td>{a.created_at}</td></tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
