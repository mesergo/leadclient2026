import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

export default function LanguagePage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const isSuper = user?.role === 'super_admin';
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.languages(token).then((d) => setRows(d.languages)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);

  const toggle = async (l) => {
    try { await api.setLanguageActive(l.slug, l.is_active ? 0 : 1, token); load(); }
    catch (e) { setError(e.message); }
  };
  const pct = (l) => (l.total ? Math.round((Number(l.translated) / Number(l.total)) * 100) : 0);

  return (
    <div>
      <div className="page-header"><h1>{t('lng.title')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>{t('lng.subtitle')}</p>
      {error && <p className="error">{error}</p>}

      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          <th>{t('lng.language')}</th><th>{t('lng.progress')}</th><th>{t('lng.options')}</th><th>{t('lng.active')}</th>
        </tr></thead>
        <tbody>{rows.map((l) => (
          <tr key={l.slug} className={l.is_active ? '' : 'row-suspended'}>
            <td>
              <button className="link-name" onClick={() => nav(`/language/${l.slug}`)}>
                {l.language} / {l.language_english}
              </button>
            </td>
            <td>
              <div className="lng-progress"><div className="lng-progress-fill" style={{ width: pct(l) + '%' }} /></div>
              <span className="muted" style={{ fontSize: 12 }}>{pct(l)}% ({Number(l.translated)}/{Number(l.total)})</span>
            </td>
            <td><button className="link-action" onClick={() => nav(`/language/${l.slug}`)}><Icons.Pencil size={13} /> {t('lng.edit')}</button></td>
            <td>
              <label className="switch-sm">
                <input type="checkbox" checked={!!l.is_active} disabled={!isSuper} onChange={() => toggle(l)} />
              </label>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
