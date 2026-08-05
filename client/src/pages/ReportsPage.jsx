import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function ReportsPage() {
  const { token } = useAuth();
  const [data, setData] = useState({ byStatus: [], byService: [] });
  const [error, setError] = useState('');
  useEffect(() => { api.reports(token, {}).then(setData).catch((e) => setError(e.message)); }, [token]);
  return (
    <div>
      <div className="page-header"><h1>דוחות</h1></div>
      {error && <p className="error">{error}</p>}
      <div className="panel"><h2>לידים לפי סטטוס</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>סטטוס</th><th>כמות</th></tr></thead>
        <tbody>{data.byStatus.map((r, i) => (<tr key={i}><td>{r.status || '-'}</td><td>{r.n}</td></tr>))}</tbody></table></div>
      </div>
      <div className="panel"><h2>לידים לפי ערוץ</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>ערוץ</th><th>כמות</th></tr></thead>
        <tbody>{data.byService.map((r, i) => (<tr key={i}><td>{r.service || '-'}</td><td>{r.n}</td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
}
