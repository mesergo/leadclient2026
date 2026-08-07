import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { Trash } from '../icons';

export default function CompanyStatusesPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ text: '', color: '#888888' });
  const [error, setError] = useState('');
  const load = () => api.statuses(token, id).then((d) => setRows(d.statuses)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);
  async function add(e) { e.preventDefault(); if (!form.text.trim()) return; try { await api.createStatus({ company_id: id, text: form.text.trim(), color: form.color, sort_order: rows.length + 1 }, token); setForm({ text: '', color: '#888888' }); load(); } catch (e) { setError(e.message); } }
  async function del(sid) { if (!confirm('?')) return; try { await api.deleteStatus(sid, token); load(); } catch (e) { setError(e.message); } }
  return (
    <div>
      <div className="page-header"><h1>{t('cop.statuses')}</h1><Link className="btn btn-secondary" to={`/companies/${id}`}>{t('common.back')}</Link></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={add}>
        <input placeholder={t('common.name')} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
        <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 48, padding: 2 }} />
        <button className="btn btn-primary">{t('cop.addStatus')}</button>
      </form>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('common.name')}</th><th>{t('cop.color')}</th><th></th></tr></thead>
        <tbody>{rows.map((s) => (<tr key={s.id}><td><span className="tag-chip" style={{ background: (s.color || '#888') + '22', color: s.color || '#555' }}>{s.text}</span></td><td>{s.color}</td><td><button className="icon-btn icon-btn--red" onClick={() => del(s.id)}><Trash size={14} /></button></td></tr>))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('common.none')}</p>}
    </div>
  );
}
