import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function BillingPage() {
  const { token } = useAuth();
  const [data, setData] = useState({ bills: [], packages: [] });
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const load = (m) => api.billing(token, m).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>מרכז החיובים</h1></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(month); }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn btn-primary">הצגה</button>
      </form>
      <div className="panel"><h2>חבילות</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>חבילה</th><th>מחיר</th><th>משתמשים</th><th>טלפונים</th><th>לידים</th></tr></thead>
        <tbody>{data.packages.map((p) => (<tr key={p.id}><td>{p.id}</td><td>{p.price} ₪</td><td>{p.users ?? '∞'}</td><td>{p.phones ?? '-'}</td><td>{p.leads ?? '-'}</td></tr>))}</tbody></table></div>
      </div>
      <div className="panel"><h2>חשבוניות</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>חברה</th><th>סוג</th><th>חודש</th><th>תאריך</th></tr></thead>
        <tbody>{data.bills.map((b) => (<tr key={b.id}><td>{b.company_name || '-'}</td><td>{b.type}</td><td>{b.billing_month}</td><td>{b.bill_date}</td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
}
