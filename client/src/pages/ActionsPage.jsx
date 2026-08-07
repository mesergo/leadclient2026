import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function ActionsPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.dashboardActions(token, { limit: 200 }).then((d) => setRows(d.actions || [])).catch((e) => setError(e.message)); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>{t('dash.recent')}</h1><Link className="btn btn-secondary" to="/">{t('common.back')}</Link></div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('dash.action')}</th><th>{t('dash.user')}</th><th>{t('dash.date')}</th></tr></thead>
        <tbody>{rows.map((a) => (<tr key={a.id}><td>{a.content}</td><td>{a.user_name}</td><td>{a.created_at}</td></tr>))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('dash.empty')}</p>}
    </div>
  );
}
