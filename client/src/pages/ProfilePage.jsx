import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const NOTIF_KEYS = ['new_lead', 'lead_conversation', 'lead_conversion', 'new_report', 'daily_leads'];
const CAMEL = { new_lead: 'newLead', lead_conversation: 'leadConversation', lead_conversion: 'leadConversion', new_report: 'newReport', daily_leads: 'dailyLeads' };
const DAYS = { he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

export default function ProfilePage() {
  const { token } = useAuth();
  const { t, lang, setLang, langs } = useLang();

  const [u, setU] = useState(null);
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({});
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [notif, setNotif] = useState({});
  const [emailN, setEmailN] = useState({});
  const [smsN, setSmsN] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api.profile(token).then(({ user }) => {
    setU(user);
    setForm({ username: user.username || '', first_name: user.first_name || '', last_name: user.last_name || '', display_name: user.display_name || '', language: user.language || 'he', email: user.email || '', phone: user.phone || '' });
    setNotif(user.notifications || {});
    setEmailN(user.email_notifications || { email: user.email || '' });
    setSmsN(user.phone_notifications || { phone: user.phone || '' });
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const days = DAYS[lang] || DAYS.he;
  const ok = () => { setMsg(t('ue.saved')); setError(''); };

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
    try { await api.updateProfileNotifications({ notifications: notif, email_notifications: emailN, phone_notifications: smsN }, token); ok(); }
    catch (er) { setError(er.message); }
  };
  const saveLanguage = async () => {
    try { await api.updateProfile({ language: form.language }, token); setLang(form.language); ok(); }
    catch (er) { setError(er.message); }
  };

  if (error && !u) return <p className="error">{error}</p>;
  if (!u) return <p className="muted">{t('common.loading')}</p>;

  const fld = (label, k, type = 'text') => (
    <div className="form-field"><label>{label}</label><div className="form-field-control">
      <input type={type} value={form[k] || ''} onChange={(e) => set(k, e.target.value)} /></div></div>
  );
  const notifBlock = (state, setState) => (<>
    {NOTIF_KEYS.map((k) => (
      <label key={k} className="notif-row">
        <input type="checkbox" checked={!!state[k]} onChange={(e) => setState({ ...state, [k]: e.target.checked })} /> {t('ue.' + CAMEL[k])}
      </label>
    ))}
    {state.daily_leads && (
      <div className="form-field"><label>{t('ue.days')}</label><div className="form-field-control">
        <div className="day-quick">
          <button type="button" className="day-chip" onClick={() => setState({ ...state, days: [0, 1, 2, 3, 4, 5] })}>{t('ue.weekdays')}</button>
          <button type="button" className="day-chip" onClick={() => setState({ ...state, days: [0, 1, 2, 3, 4, 5, 6] })}>{t('ue.allDays')}</button>
        </div>
        <div className="day-chips">{days.map((d, i) => {
          const on = (state.days || []).includes(i);
          return <button type="button" key={i} className={'day-chip' + (on ? ' on' : '')}
            onClick={() => setState({ ...state, days: on ? state.days.filter((x) => x !== i) : [...(state.days || []), i] })}>{d}</button>;
        })}</div>
      </div></div>
    )}
  </>);

  return (
    <div>
      <div className="page-header"><h1>{t('pr.title')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>{t('pr.subtitle')} — {u.agency_name || '-'} › {u.company_name || '-'}</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="tabs">
        {[['profile', 'ue.tabProfile'], ['password', 'ue.tabPassword'], ['notif', 'ue.tabNotif'], ['email', 'ue.tabEmail'], ['sms', 'ue.tabSms'], ['lang', 'ue.tabLang']]
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

          {tab === 'notif' && <div className="notif-block">{notifBlock(notif, setNotif)}</div>}

          {tab === 'email' && (<>
            <div className="form-field"><label>{t('common.email')}</label><div className="form-field-control">
              <input type="email" value={emailN.email || ''} onChange={(e) => setEmailN({ ...emailN, email: e.target.value })} /></div></div>
            <div className="notif-block">{notifBlock(emailN, setEmailN)}</div>
          </>)}

          {tab === 'sms' && (<>
            <div className="form-field"><label>{t('ue.smsPhone')}</label><div className="form-field-control">
              <input type="tel" value={smsN.phone || ''} onChange={(e) => setSmsN({ ...smsN, phone: e.target.value })} /></div></div>
            <div className="notif-block">{notifBlock(smsN, setSmsN)}</div>
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
          {(tab === 'notif' || tab === 'email' || tab === 'sms') && <button className="btn btn-primary" onClick={saveNotif}>{t('ue.save')}</button>}
          {tab === 'lang' && <button className="btn btn-primary" onClick={saveLanguage}>{t('ue.save')}</button>}
        </div>
      </form>
    </div>
  );
}
