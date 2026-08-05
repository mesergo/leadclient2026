import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function ImportPage() {
  const { token, user } = useAuth();
  const needsPicker = user?.role !== 'company_admin' && user?.role !== 'company_user';
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (needsPicker) api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {}); }, [token]);
  const activeCompany = needsPicker ? companyId : user?.company_id;

  async function add(e) {
    e.preventDefault();
    if (!form.phone.trim() || !activeCompany) return;
    setError('');
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:4000') + '/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ company_id: activeCompany, rows: [{ name: form.name, phone: form.phone, email: form.email }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data); setForm({ name: '', phone: '', email: '' });
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="page-header"><h1>ייבוא לידים</h1></div>
      {error && <p className="error">{error}</p>}
      {result && <p className="success-note">יובאו {result.success}/{result.total} לידים.</p>}
      {needsPicker && (
        <div className="inline-form"><select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">בחר חברה</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      )}
      {activeCompany && (
        <div className="panel"><h2>הוספת ליד בודד</h2>
          <form className="inline-form" onSubmit={add}>
            <input placeholder="שם" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="טלפון" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="אימייל" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <button className="btn btn-primary">הוספה</button>
          </form>
        </div>
      )}
    </div>
  );
}
