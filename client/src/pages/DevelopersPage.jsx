import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, API_ORIGIN } from '../api';

export default function DevelopersPage() {
  const { token } = useAuth();
  const [services, setServices] = useState([]);
  const [sel, setSel] = useState('');
  useEffect(() => { api.services(token).then((d) => setServices(d.services)).catch(() => {}); }, [token]);
  const svc = services.find((s) => String(s.id) === String(sel));
  const snippet = svc ? `<script src="${API_ORIGIN}/leadclient.js?CH=${svc.public_hash}"></script>` : '';
  return (
    <div>
      <div className="page-header"><h1>מפתחים</h1></div>
      <div className="panel"><h2>הטמעת LeadClient</h2>
        <p className="muted">בחר ערוץ לחיבור:</p>
        <select value={sel} onChange={(e) => setSel(e.target.value)}><option value="">בחר ערוץ...</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.company_name})</option>)}</select>
        {snippet && (<div style={{ marginTop: '1rem' }}><label>קוד הטמעה:</label>
          <pre style={{ background: '#f4f6f8', padding: '1rem', borderRadius: 6, overflowX: 'auto' }}>{snippet}</pre></div>)}
      </div>
      <div className="panel"><h2>קודי שגיאה</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>קוד</th><th>תיאור</th></tr></thead>
        <tbody><tr><td>no_channel_id</td><td>לא התקבל קוד ערוץ תקין</td></tr><tr><td>missing_phone</td><td>חסר מספר טלפון בפנייה</td></tr></tbody></table></div>
      </div>
    </div>
  );
}
