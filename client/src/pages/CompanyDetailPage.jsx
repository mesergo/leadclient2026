import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function CompanyDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [c, setC] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = () => api.company(id, token).then((d) => { setC(d.company); setForm(d.company); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);

  async function save(e) { e.preventDefault(); setMsg('');
    try { await api.updateCompany(id, { name: form.name, phone: form.phone, fax: form.fax, address: form.address, zip_code: form.zip_code, industry: form.industry }, token); setMsg('נשמר.'); load(); }
    catch (e) { setError(e.message); } }

  if (error) return <p className="error">{error}</p>;
  if (!c) return <p className="muted">טוען...</p>;
  const fld = (k, label) => (<div className="form-field"><label>{label}</label><div className="form-field-control"><input value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div></div>);
  return (
    <div>
      <div className="page-header"><h1>{c.name}</h1><Link className="btn btn-secondary" to="/companies">חזרה</Link></div>
      {msg && <p className="success-note">{msg}</p>}
      <form className="form-panel" onSubmit={save}>
        <div className="form-panel-body">
          {fld('name', 'שם החברה')}{fld('phone', 'טלפון')}{fld('fax', 'פקס')}
          {fld('address', 'כתובת')}{fld('zip_code', 'מיקוד')}{fld('industry', 'ענף')}
        </div>
        <div className="form-actions"><button className="btn btn-primary">שמירה</button></div>
      </form>
    </div>
  );
}
