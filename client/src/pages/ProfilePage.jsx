import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { browserPushStatus, enableBrowserPush, disableBrowserPush } from '../push';

// notification matrix: which events, on which channels
const N_EVENTS = ['new_lead', 'status_change', 'reminder_due', 'lead_message'];
const N_CHANS = ['app', 'browser', 'sms'];

export default function ProfilePage() {
  const { token } = useAuth();
  const { t, setLang, langs } = useLang();

  const [u, setU] = useState(null);
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({});
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [notif, setNotif] = useState({});
  const [pushState, setPushState] = useState('off');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api.profile(token).then(({ user }) => {
    setU(user);
    setForm({ username: user.username || '', first_name: user.first_name || '', last_name: user.last_name || '', display_name: user.display_name || '', language: user.language || 'he', email: user.email || '', phone: user.phone || '' });
    setNotif(user.notifications && typeof user.notifications === 'object' ? user.notifications : {});
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  useEffect(() => { browserPushStatus().then(setPushState).catch(() => {}); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ok = (m) => { setMsg(m || t('ue.saved')); setError(''); };

  const cell = (ev, ch) => !!(notif[ev] && notif[ev][ch]);
  const toggle = (ev, ch) => setNotif((p) => ({ ...p, [ev]: { ...(p[ev] || { app: true }), [ch]: !cell(ev, ch) } }));

  const saveProfile = async (e) => {
    e.preventDefault();
    try { await api.updateProfile({ username: form.username, first_name: form.first_name, last_name: form.last_name, display_name: form.display_name }, token); ok(); load(); }
    catch (er) { setError(er.message); }
  };
  const savePassword = async (e) => {
    e.preventDefault();
    if (!pw.new_password) return;
    if (pw.new_password !== pw.confirm) return setError(t('ue.pwMismatch'));
    try { await api.updatePassword({ current_password: pw.current_password, new_password: pw.new_password }, token); ok(); setPw({ current_password: '', new_password: '', confirm: '' }); }
    catch (er) { setError(er.message); }
  };
  const saveNotif = async () => {
    try { await api.updateProfileNotifications({ notifications: notif, email_notifications: {}, phone_notifications: {} }, token); ok(t('notif.saved')); }
    catch (er) { setError(er.message); }
  };
  const saveLanguage = async () => {
    try { await api.updateProfile({ language: form.language }, token); setLang(form.language); ok(); }
    catch (er) { setError(er.message); }
  };

  const enablePush = async () => { try { await enableBrowserPush(token); setPushState('on'); ok(t('notif.browserOn')); } catch (er) { setError(er.message); } };
  const disablePush = async () => { try { await disableBrowserPush(token); setPushState('off'); ok(); } catch (er) { setError(er.message); } };
  const sendTest = async () => { try { await api.notifyTest(token); ok(t('notif.saved')); } catch (er) { setError(er.message); } };

  if (error && !u) return <p className="error">{error}</p>;
  if (!u) return <p className="muted">{t('common.loading')}</p>;

  const fld = (label, k, type = 'text') => (
    <div className="form-field"><label>{label}</label><div className="form-field-control">
      <input type={type} value={form[k] || ''} onChange={(e) => set(k, e.target.value)} /></div></div>
  );

  return (
    <div>
      <div className="page-header"><h1>{t('pr.title')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>{t('pr.subtitle')} — {u.agency_name || '-'} › {u.company_name || '-'}</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="tabs">
        {[['profile', 'ue.tabProfile'], ['password', 'ue.tabPassword'], ['notif', 'notif.prefs'], ['lang', 'ue.tabLang']]
          .map(([k, lbl]) => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{t(lbl)}</button>)}
      </div>

      <form className="form-panel" onSubmit={(e) => e.preventDefault()}>
        <div className="form-panel-body">
          {tab === 'profile' && (<>
            {fld(t('ue.username'), 'username')}
            {fld(t('ue.firstName'), 'first_name')}
            {fld(t('ue.lastName'), 'last_name')}
            {fld(t('ue.displayName'), 'display_name')}
          </>)}

          {tab === 'password' && (<>
            <div className="form-field"><label>{t('ue.currentPassword')}</label><div className="form-field-control">
              <input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></div></div>
            <div className="form-field"><label>{t('ue.newPassword')}</label><div className="form-field-control">
              <input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></div></div>
            <div className="form-field"><label>{t('ue.confirmPassword')}</label><div className="form-field-control">
              <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></div></div>
          </>)}

          {tab === 'notif' && (<>
            <div className="push-cta">
              {pushState === 'on' && (<><span className="pill pill-on">{t('notif.browserOn')}</span>
                <button type="button" className="btn btn-secondary" onClick={disablePush}>{t('notif.disableBrowser')}</button></>)}
              {pushState === 'off' && <button type="button" className="btn btn-primary" onClick={enablePush}>{t('notif.enableBrowser')}</button>}
              {pushState === 'denied' && <span className="muted">{t('notif.browserDenied')}</span>}
              {pushState === 'unsupported' && <span className="muted">{t('notif.browserUnsupported')}</span>}
              <button type="button" className="btn btn-secondary" onClick={sendTest}>{t('notif.test')}</button>
            </div>
            <div className="table-wrap">
              <table className="data-table notif-matrix">
                <thead><tr><th>{t('notif.event')}</th>{N_CHANS.map((ch) => <th key={ch}>{t('notif.chan.' + ch)}</th>)}</tr></thead>
                <tbody>
                  {N_EVENTS.map((ev) => (
                    <tr key={ev}>
                      <td>{t('notif.ev.' + ev)}</td>
                      {N_CHANS.map((ch) => (
                        <td key={ch} style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={cell(ev, ch)} onChange={() => toggle(ev, ch)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {tab === 'lang' && (
            <div className="form-field"><label>{t('ue.language')}</label><div className="form-field-control">
              <select value={form.language} onChange={(e) => set('language', e.target.value)}>
                {langs.map((l) => <option key={l.slug} value={l.slug}>{l.language}</option>)}
              </select></div></div>
          )}
        </div>
        <div className="form-actions">
          {tab === 'profile' && <button className="btn btn-primary" onClick={saveProfile}>{t('ue.save')}</button>}
          {tab === 'password' && <button className="btn btn-primary" onClick={savePassword}>{t('ue.save')}</button>}
          {tab === 'notif' && <button className="btn btn-primary" onClick={saveNotif}>{t('ue.save')}</button>}
          {tab === 'lang' && <button className="btn btn-primary" onClick={saveLanguage}>{t('ue.save')}</button>}
        </div>
      </form>
    </div>
  );
}
