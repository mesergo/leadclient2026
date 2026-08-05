import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function BillingPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [data, setData] = useState({ bills: [], packages: [] });
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const load = (m) => api.billing(token, m).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>{t('nav.billing')}</h1></div>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); load(month); }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn btn-primary">{t('lead.show')}</button>
      </form>
      <div className="panel"><h2>{t('bil.packages')}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('bil.package')}</th><th>{t('bil.price')}</th><th>{t('bil.users')}</th><th>{t('bil.phones')}</th><th>{t('bil.leads')}</th></tr></thead>
        <tbody>{data.packages.map((p) => (<tr key={p.id}><td>{p.id}</td><td>{p.price} ₪</td><td>{p.users ?? '∞'}</td><td>{p.phones ?? '-'}</td><td>{p.leads ?? '-'}</td></tr>))}</tbody></table></div>
      </div>
      <div className="panel"><h2>{t('bil.invoices')}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('common.company')}</th><th>{t('bil.type')}</th><th>{t('bil.month')}</th><th>{t('common.date')}</th></tr></thead>
        <tbody>{data.bills.map((b) => (<tr key={b.id}><td>{b.company_name || '-'}</td><td>{b.type}</td><td>{b.billing_month}</td><td>{b.bill_date}</td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
}
