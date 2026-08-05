import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';

export default function DevelopersPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [services, setServices] = useState([]);
  const [sel, setSel] = useState('');
  useEffect(() => { api.services(token).then((d) => setServices(d.services)).catch(() => {}); }, [token]);
  const svc = services.find((s) => String(s.id) === String(sel));
  const snippet = svc ? `<script src="${API_ORIGIN}/leadclient.js?CH=${svc.public_hash}"></script>` : '';
  return (
    <div>
      <div className="page-header"><h1>{t('nav.developers')}</h1></div>
      <div className="panel"><h2>{t('dev.embed')}</h2>
        <p className="muted">{t('dev.pick')}</p>
        <select value={sel} onChange={(e) => setSel(e.target.value)}><option value="">{t('dev.pickPh')}</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.company_name})</option>)}</select>
        {snippet && (<div style={{ marginTop: '1rem' }}><label>{t('dev.code')}</label>
          <pre style={{ background: '#f4f6f8', padding: '1rem', borderRadius: 6, overflowX: 'auto' }}>{snippet}</pre></div>)}
      </div>
      <div className="panel"><h2>{t('dev.errCodes')}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('dev.errCode')}</th><th>{t('dev.errDesc')}</th></tr></thead>
        <tbody><tr><td>no_channel_id</td><td>{t('dev.err.noChannel')}</td></tr><tr><td>missing_phone</td><td>{t('dev.err.noPhone')}</td></tr></tbody></table></div>
      </div>
    </div>
  );
}
