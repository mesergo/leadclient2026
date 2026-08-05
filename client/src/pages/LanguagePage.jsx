import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function LanguagePage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.languages(token).then((d) => setRows(d.languages)).catch((e) => setError(e.message)); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>{t('nav.language')}</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('lng.language')}</th><th>{t('lng.english')}</th><th>{t('lng.dir')}</th><th>{t('lng.active')}</th></tr></thead>
        <tbody>{rows.map((l) => (<tr key={l.slug}><td>{l.language}</td><td>{l.language_english}</td><td>{l.is_rtl ? 'RTL' : 'LTR'}</td><td>{l.is_active ? t('common.yes') : t('common.no')}</td></tr>))}</tbody>
      </table></div>
    </div>
  );
}
