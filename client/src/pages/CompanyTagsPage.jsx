import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function CompanyTagsPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const load = () => api.tags(token, id).then((d) => setRows(d.tags)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);
  async function add(e) { e.preventDefault(); if (!label.trim()) return; try { await api.createTag({ company_id: id, label: label.trim() }, token); setLabel(''); load(); } catch (e) { setError(e.message); } }
  return (
    <div>
      <div className="page-header"><h1>{t('cop.tags')}</h1><Link className="btn btn-secondary" to={`/companies/${id}`}>{t('common.back')}</Link></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={add}>
        <input placeholder={t('cop.label')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-primary">{t('cop.addTag')}</button>
      </form>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {rows.map((tg) => <span key={tg.id} className="tag-chip">{tg.label}</span>)}
        {rows.length === 0 && <p className="muted">{t('common.none')}</p>}
      </div>
    </div>
  );
}
