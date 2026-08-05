import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function VirtualPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const load = () => api.virtual(token).then((d) => setRows(d.numbers)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>{t('nav.virtual')}</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('vir.number')}</th><th>{t('vir.target')}</th><th>{t('vir.provider')}</th><th>{t('common.company')}</th><th>{t('vir.premium')}</th></tr></thead>
        <tbody>{rows.map((n) => (<tr key={n.id}><td>{n.phone_number}</td><td>{n.redirect_to_number || '-'}</td><td>{n.ivr_provider}</td><td>{n.company_name || '-'}</td><td>{n.is_premium ? t('common.yes') : t('common.no')}</td></tr>))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('vir.none')}</p>}
    </div>
  );
}
