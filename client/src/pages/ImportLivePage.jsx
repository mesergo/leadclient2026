import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

// Live-DB delta sync (read-only source). Save the connection, then "Sync now"
// pulls new records into our DB. The live DB is never modified.
export default function ImportLivePage() {
  const { token } = useAuth();
  const [conn, setConn] = useState({ host: '', port: '3306', user: '', password: '', database: '' });
  const [saved, setSaved] = useState(null);
  const [test, setTest] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const poll = useRef(null);

  const set = (k, v) => setConn((c) => ({ ...c, [k]: v }));

  const loadConfig = () => api.liveConfigGet(token).then(({ config }) => {
    setSaved(config);
    if (config) setConn((c) => ({ ...c, host: config.host || '', port: String(config.port || 3306), user: config.user || '', database: config.database || '', password: '' }));
  }).catch(() => {});
  useEffect(() => { loadConfig(); return () => clearInterval(poll.current); }, [token]);

  const saveConn = async () => {
    setError(''); setMsg(''); setBusy(true);
    try { await api.liveConfigSave(conn, token); setMsg('החיבור נשמר'); await loadConfig(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };
  const doTest = async () => {
    setError(''); setTest(null); setBusy(true);
    try { const d = await api.importLiveTest(conn.host ? conn : {}, token); setTest(d.counts); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };
  const startPoll = () => {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try { const s = await api.importLiveStatus(token); setJob(s); if (!s.running) { clearInterval(poll.current); loadConfig(); } } catch { /* */ }
    }, 1500);
  };
  const doSync = async () => {
    setError(''); setMsg('');
    try { const d = await api.liveSync(token); setJob(d.job); startPoll(); }
    catch (e) { setError(e.message); }
  };

  const phaseLabel = { starting: 'מתחיל…', mirror: 'שכיפת נתונים מה-DB החי', transform: 'המרה + הוספה (חדשים בלבד)', finalize: 'ניקוי סופי', done: 'הסתיים ✓', error: 'שגיאה' };
  const tables = job?.tables ? Object.entries(job.tables) : [];
  const canSync = saved && !job?.running;

  return (
    <div>
      <div className="page-header"><h1>סנכרון DB חי (זמני)</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>הזן חיבור <strong>לקריאה בלבד</strong> ל-DB החי. "סנכרן עכשיו" מושך רק רשומות חדשות אל ה-DB שלנו — ה-DB החי לא משתנה.</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="form-panel">
        <div className="form-panel-body">
          <div className="form-field"><label>Host</label><div className="form-field-control"><input value={conn.host} onChange={(e) => set('host', e.target.value)} placeholder="localhost / db.example.com" /></div></div>
          <div className="form-field"><label>Port</label><div className="form-field-control"><input value={conn.port} onChange={(e) => set('port', e.target.value)} style={{ maxWidth: 120 }} /></div></div>
          <div className="form-field"><label>שם משתמש (read-only)</label><div className="form-field-control"><input value={conn.user} onChange={(e) => set('user', e.target.value)} autoComplete="off" /></div></div>
          <div className="form-field"><label>סיסמה</label><div className="form-field-control"><input type="password" value={conn.password} onChange={(e) => set('password', e.target.value)} autoComplete="off" placeholder={saved?.hasPassword ? '•••••• (שמורה)' : ''} /></div></div>
          <div className="form-field"><label>שם ה-DB</label><div className="form-field-control"><input value={conn.database} onChange={(e) => set('database', e.target.value)} placeholder="app_leadclient_net" /></div></div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={saveConn} disabled={busy || !conn.host || !conn.user || !conn.database}>שמירת חיבור</button>
          <button className="btn btn-secondary" onClick={doTest} disabled={busy}>בדיקת חיבור</button>
        </div>
      </div>

      {test && (
        <div className="panel"><h3>החיבור תקין ✓</h3>
          <p className="muted">סוכנויות: {test.agencies ?? '—'} · חברות: {test.companies ?? '—'} · לידים: {test.leads ?? '—'}</p></div>
      )}

      <div className="panel">
        <div className="page-header"><h3>סנכרון</h3>
          <button className="btn btn-primary" onClick={doSync} disabled={!canSync}>סנכרן עכשיו</button></div>
        {!saved && <p className="muted">שמור חיבור תחילה.</p>}
        {saved?.last_sync_at && <p className="muted">סנכרון אחרון: {saved.last_sync_at}</p>}
        {job && (<>
          <p><strong>{phaseLabel[job.phase] || job.phase}</strong> {job.running && '…'}</p>
          {job.error && <p className="error">{job.error}</p>}
          {tables.length > 0 && (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>טבלה</th><th>נמשכו</th></tr></thead>
              <tbody>{tables.map(([t, v]) => (
                <tr key={t}><td>{t}</td><td>{v.error ? <span className="error">{v.error}</span> : Number(v.copied || 0).toLocaleString()}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          {job.phase === 'done' && <p className="success-note">הסנכרון הסתיים. רענן כדי לראות את הנתונים החדשים.</p>}
        </>)}
      </div>
    </div>
  );
}
