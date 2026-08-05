import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function ReportsPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [data, setData] = useState({ byStatus: [], byService: [] });
  const [error, setError] = useState('');
  useEffect(() => { api.reports(token, {}).then(setData).catch((e) => setError(e.message)); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>{t('nav.reports')}</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="panel"><h2>{t('rep.byStatus')}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('common.status')}</th><th>{t('common.amount')}</th></tr></thead>
        <tbody>{data.byStatus.map((r, i) => (<tr key={i}><td>{r.status || '-'}</td><td>{r.n}</td></tr>))}</tbody></table></div>
      </div>
      <div className="panel"><h2>{t('rep.byChannel')}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('rep.channel')}</th><th>{t('common.amount')}</th></tr></thead>
        <tbody>{data.byService.map((r, i) => (<tr key={i}><td>{r.service || '-'}</td><td>{r.n}</td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
}
