import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

// Super admin: push to the mobile app's users, and the "new version in the store" notice.
export default function AppPushPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [log, setLog] = useState([]);
  const [msg, setMsg] = useState({ title: '', body: '', url: '', target: 'all', company_id: '', user_id: '' });
  const [ver, setVer] = useState({ latest: '', min: '', url: '', message: '' });
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({ kind: '', text: '' });

  const load = () => {
    api.appAdminStats(token).then(setStats).catch((e) => setNote({ kind: 'error', text: e.message }));
    api.appAdminLog(token).then((d) => setLog(d.log || [])).catch(() => {});
    api.appAdminVersion(token).then((v) => setVer({ latest: v.latest || '', min: v.min || '', url: v.url || '', message: v.message || '' })).catch(() => {});
  };
  useEffect(load, [token]);

  const targetCount = () => {
    if (!stats) return 0;
    if (msg.target === 'company') return (stats.companies.find((c) => String(c.id) === String(msg.company_id)) || {}).users || 0;
    if (msg.target === 'user') return msg.user_id ? 1 : 0;
    return stats.users;
  };

  async function sendPush() {
    setNote({ kind: '', text: '' });
    if (!msg.title.trim()) { setNote({ kind: 'error', text: t('ap.errTitle') }); return; }
    if (!window.confirm(t('ap.confirmSend').replace('{n}', targetCount()))) return;
    setBusy('push');
    try {
      const r = await api.appAdminPush(token, msg);
      setNote({ kind: 'ok', text: t('ap.sent').replace('{u}', r.users).replace('{d}', r.devices) });
      setMsg((m) => ({ ...m, title: '', body: '', url: '' }));
      load();
    } catch (e) { setNote({ kind: 'error', text: e.message }); } finally { setBusy(''); }
  }

  async function saveVersion() {
    setNote({ kind: '', text: '' });
    if (notify && ver.latest && !window.confirm(t('ap.confirmNotify').replace('{n}', stats ? stats.users : 0))) return;
    setBusy('ver');
    try {
      const r = await api.appAdminSetVersion(token, { ...ver, notify });
      setNote({ kind: 'ok', text: r.pushed ? t('ap.verSavedPushed').replace('{u}', r.pushed.users) : t('ap.verSaved') });
      load();
    } catch (e) { setNote({ kind: 'error', text: e.message }); } finally { setBusy(''); }
  }

  const set = (k) => (e) => setMsg((m) => ({ ...m, [k]: e.target.value }));
  const setV = (k) => (e) => setVer((v) => ({ ...v, [k]: e.target.value }));

  return (
    <div>
      <div className="page-header"><h1>{t('nav.appPush')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>
        {stats ? t('ap.stats').replace('{u}', stats.users).replace('{d}', stats.devices) : '…'}
        {stats && !stats.push_ready && <> · <span className="error">{t('ap.notReady')}</span></>}
      </p>
      {note.text && <p className={note.kind === 'error' ? 'error' : 'success-note'}>{note.text}</p>}

      <div className="panel">
        <h2>{t('ap.pushTitle')}</h2>
        <div className="field"><label>{t('ap.target')}</label>
          <select value={msg.target} onChange={set('target')}>
            <option value="all">{t('ap.targetAll')}</option>
            <option value="company">{t('ap.targetCompany')}</option>
            <option value="user">{t('ap.targetUser')}</option>
          </select>
        </div>
        {msg.target === 'company' && (
          <div className="field"><label>{t('ap.company')}</label>
            <select value={msg.company_id} onChange={set('company_id')}>
              <option value="">—</option>
              {(stats?.companies || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.users})</option>)}
            </select>
          </div>
        )}
        {msg.target === 'user' && (
          <div className="field"><label>{t('ap.user')}</label>
            <select value={msg.user_id} onChange={set('user_id')}>
              <option value="">—</option>
              {(stats?.app_users || []).map((u) => <option key={u.id} value={u.id}>{u.name}{u.company_name ? ` · ${u.company_name}` : ''}</option>)}
            </select>
          </div>
        )}
        <div className="field"><label>{t('ap.msgTitle')}</label><input value={msg.title} maxLength={100} onChange={set('title')} /></div>
        <div className="field"><label>{t('ap.msgBody')}</label><textarea rows={3} value={msg.body} maxLength={500} onChange={set('body')} /></div>
        <div className="field"><label>{t('ap.msgUrl')}</label><input dir="ltr" value={msg.url} placeholder="https://…" onChange={set('url')} /></div>
        <button className="btn btn-primary" disabled={busy === 'push'} onClick={sendPush}>
          {busy === 'push' ? t('ap.sending') : t('ap.send').replace('{n}', targetCount())}
        </button>
      </div>

      <div className="panel">
        <h2>{t('ap.verTitle')}</h2>
        <p className="muted">{t('ap.verHint')}</p>
        <div className="field"><label>{t('ap.latest')}</label><input dir="ltr" value={ver.latest} placeholder="1.1.6" onChange={setV('latest')} /></div>
        <div className="field"><label>{t('ap.min')}</label><input dir="ltr" value={ver.min} placeholder={t('ap.minPh')} onChange={setV('min')} /></div>
        <div className="field"><label>{t('ap.storeUrl')}</label><input dir="ltr" value={ver.url} onChange={setV('url')} /></div>
        <div className="field"><label>{t('ap.verMsg')}</label><input value={ver.message} maxLength={300} placeholder={t('ap.verMsgPh')} onChange={setV('message')} /></div>
        <label className="remember-me"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('ap.notifyAll')}</label>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-primary" disabled={busy === 'ver'} onClick={saveVersion}>{busy === 'ver' ? t('ap.saving') : t('ap.saveVer')}</button>
        </div>
      </div>

      <div className="panel">
        <h2>{t('ap.logTitle')}</h2>
        {log.length === 0 ? <p className="muted">{t('ap.logEmpty')}</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>{t('ap.when')}</th><th>{t('ap.kind')}</th><th>{t('ap.target')}</th><th>{t('ap.msgTitle')}</th><th>{t('ap.reach')}</th><th>{t('ap.by')}</th></tr></thead>
            <tbody>{log.map((l) => (
              <tr key={l.id}>
                <td>{l.created_at}</td>
                <td>{l.kind === 'app_update' ? t('ap.kindUpdate') : t('ap.kindPush')}</td>
                <td>{l.target === 'company' ? l.company_name || t('ap.targetCompany') : l.target === 'user' ? t('ap.targetUser') : t('ap.targetAll')}</td>
                <td title={l.body || ''}>{l.title}</td>
                <td>{t('ap.reachVal').replace('{u}', l.users_count).replace('{d}', l.devices_count)}</td>
                <td>{l.user_name || ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
