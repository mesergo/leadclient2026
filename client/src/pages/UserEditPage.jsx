import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const ROLES = ['super_admin', 'agency_admin', 'company_admin', 'company_user', 'translator'];
const ROLE_LABELS = {
  he: { super_admin: 'מנהל על', agency_admin: 'מנהל סוכנות', company_admin: 'מנהל חברה', company_user: 'משתמש', translator: 'מתרגם' },
  en: { super_admin: 'Super admin', agency_admin: 'Agency admin', company_admin: 'Company admin', company_user: 'User', translator: 'Translator' },
};
const SUSP = ['none', 'permanent', '1', '7', '14', '30', '90'];
const NOTIF_KEYS = ['new_lead', 'lead_conversation', 'lead_conversion', 'new_report', 'daily_leads'];
const DAYS = { he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

export default function UserEditPage() {
  const { id } = useParams();
  const { token, user: me } = useAuth();
  const { t, lang } = useLang();
  const nav = useNavigate();
  const isSuper = me?.role === 'super_admin';

  const [u, setU] = useState(null);
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({});
  const [suspension, setSuspension] = useState('none');
  const [pw, setPw] = useState({ new_password: '', confirm: '' });
  const [notif, setNotif] = useState({});
  const [emailN, setEmailN] = useState({});
  const [smsN, setSmsN] = useState({});
  const [restrict, setRestrict] = useState({ login_hours: { enabled: false, from: '', to: '' }, login_source: { enabled: false, ips: '' } });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.userById(id, token).then(({ user }) => {
      setU(user);
      setForm({
        username: user.username || '', first_name: user.first_name || '', last_name: user.last_name || '',
        display_name: user.display_name || '', role: user.role, email: user.email || '', phone: user.phone || '',
        language: user.language || 'he',
      });
      setSuspension(user.is_active ? 'none' : (user.suspended_until ? 'custom' : 'permanent'));
      setNotif(user.notifications || {});
      setEmailN(user.email_notifications || { email: user.email || '' });
      setSmsN(user.phone_notifications || { phone: user.phone || '' });
      setRestrict(user.restrictions || { login_hours: { enabled: false, from: '', to: '' }, login_source: { enabled: false, ips: '' } });
    }).catch((e) => setError(e.message));
  }, [id, token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const roleLabel = (r) => (ROLE_LABELS[lang] || ROLE_LABELS.he)[r] || r;
  const days = DAYS[lang] || DAYS.he;

  const save = async (extra = {}) => {
    setMsg(''); setError('');
    try { await api.updateUser(id, extra, token); setMsg(t('ue.saved')); }
    catch (e) { setError(e.message); }
  };

  const saveProfile = (e) => {
    e.preventDefault();
    const body = { username: form.username, first_name: form.first_name, last_name: form.last_name, display_name: form.display_name };
    if (isSuper) body.role = form.role;
    if (suspension === 'none') { body.is_active = 1; body.suspended_at = null; body.suspended_until = null; }
    else if (suspension === 'permanent') { body.is_active = 0; body.suspended_until = null; }
    else if (suspension !== 'custom') {
      const until = new Date(Date.now() + Number(suspension) * 86400000);
      body.is_active = 0; body.suspended_until = until.toISOString().slice(0, 19).replace('T', ' ');
    }
    save(body);
  };
  const savePassword = (e) => {
    e.preventDefault();
    if (!pw.new_password) return;
    if (pw.new_password !== pw.confirm) return setError(t('ue.pwMismatch'));
    save({ password: pw.new_password }).then(() => setPw({ new_password: '', confirm: '' }));
  };

  if (error && !u) return <p className="error">{error}</p>;
  if (!u) return <p className="muted">{t('common.loading')}</p>;

  const fld = (label, k, type = 'text') => (
    <div className="form-field"><label>{label}</label><div className="form-field-control">
      <input type={type} value={form[k] || ''} onChange={(e) => set(k, e.target.value)} /></div></div>
  );

  // shared notification checkbox + days block
  const notifBlock = (state, setState) => (<>
    {NOTIF_KEYS.map((k) => (
      <label key={k} className="notif-row">
        <input type="checkbox" checked={!!state[k]} onChange={(e) => setState({ ...state, [k]: e.target.checked })} /> {t('ue.' + toCamel(k))}
      </label>
    ))}
    {state.daily_leads && (
      <div className="form-field"><label>{t('ue.days')}</label><div className="form-field-control">
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
      <div className="page-header">
        <h1>{t('ue.title')}: {u.display_name || u.username}</h1>
        <button className="btn btn-secondary" onClick={() => nav('/users')}>{t('ue.back')}</button>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>{u.agency_name || '-'} › {u.company_name || '-'}</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="tabs">
        {[['profile', 'ue.tabProfile'], ['password', 'ue.tabPassword'], ['notif', 'ue.tabNotif'], ['email', 'ue.tabEmail'], ['sms', 'ue.tabSms'], ['lang', 'ue.tabLang'], ['restrict', 'ue.tabRestrict']]
          .map(([k, lbl]) => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{t(lbl)}</button>)}
      </div>

      <form className="form-panel" onSubmit={(e) => e.preventDefault()}>
        <div className="form-panel-body">
          {tab === 'profile' && (<>
            {fld(t('ue.username'), 'username')}
            {fld(t('ue.firstName'), 'first_name')}
            {fld(t('ue.lastName'), 'last_name')}
            {fld(t('ue.displayName'), 'display_name')}
            <div className="form-field"><label>{t('ue.suspension')}</label><div className="form-field-control">
              <select value={suspension} onChange={(e) => setSuspension(e.target.value)}>
                {suspension === 'custom' && <option value="custom">{t('ue.suspPermanent')} ({u.suspended_until})</option>}
                {SUSP.map((s) => <option key={s} value={s}>{t('ue.susp' + (s === 'none' ? 'None' : s === 'permanent' ? 'Permanent' : s))}</option>)}
              </select></div></div>
            {isSuper && (
              <div className="form-field"><label>{t('ue.role')}</label><div className="form-field-control">
                <select value={form.role} onChange={(e) => set('role', e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select></div></div>
            )}
          </>)}

          {tab === 'password' && (<>
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
            <div className="form-field"><label>{t('ue.channel')}</label><div className="form-field-control">
              <label className="notif-row"><input type="checkbox" checked={(smsN.channels || []).includes('SMS')} onChange={(e) => toggleArr(smsN, setSmsN, 'channels', 'SMS', e.target.checked)} /> SMS</label>
              <label className="notif-row"><input type="checkbox" checked={(smsN.channels || []).includes('Whatsapp')} onChange={(e) => toggleArr(smsN, setSmsN, 'channels', 'Whatsapp', e.target.checked)} /> WhatsApp</label>
            </div></div>
            <div className="notif-block">{notifBlock(smsN, setSmsN)}</div>
            <label className="notif-row"><input type="checkbox" checked={!!smsN.agreement} onChange={(e) => setSmsN({ ...smsN, agreement: e.target.checked })} /> {t('ue.smsAgree')}</label>
          </>)}

          {tab === 'lang' && (
            <div className="form-field"><label>{t('ue.language')}</label><div className="form-field-control">
              <select value={form.language} onChange={(e) => set('language', e.target.value)}>
                <option value="he">עברית</option><option value="en">English</option>
              </select></div></div>
          )}

          {tab === 'restrict' && (<>
            <label className="notif-row"><input type="checkbox" checked={restrict.login_hours.enabled}
              onChange={(e) => setRestrict({ ...restrict, login_hours: { ...restrict.login_hours, enabled: e.target.checked } })} /> {t('ue.loginHours')}</label>
            {restrict.login_hours.enabled && (
              <div className="filter-row">
                <label className="filter-item"><span>{t('ue.from')}</span><input type="time" value={restrict.login_hours.from}
                  onChange={(e) => setRestrict({ ...restrict, login_hours: { ...restrict.login_hours, from: e.target.value } })} /></label>
                <label className="filter-item"><span>{t('ue.to')}</span><input type="time" value={restrict.login_hours.to}
                  onChange={(e) => setRestrict({ ...restrict, login_hours: { ...restrict.login_hours, to: e.target.value } })} /></label>
              </div>
            )}
            <label className="notif-row"><input type="checkbox" checked={restrict.login_source.enabled}
              onChange={(e) => setRestrict({ ...restrict, login_source: { ...restrict.login_source, enabled: e.target.checked } })} /> {t('ue.loginSource')}</label>
            {restrict.login_source.enabled && (
              <div className="form-field"><label>{t('ue.allowedIps')}</label><div className="form-field-control">
                <input value={restrict.login_source.ips} onChange={(e) => setRestrict({ ...restrict, login_source: { ...restrict.login_source, ips: e.target.value } })} /></div></div>
            )}
          </>)}
        </div>
        <div className="form-actions">
          {tab === 'profile' && <button className="btn btn-primary" onClick={saveProfile}>{t('ue.save')}</button>}
          {tab === 'password' && <button className="btn btn-primary" onClick={savePassword}>{t('ue.save')}</button>}
          {tab === 'notif' && <button className="btn btn-primary" onClick={() => save({ notifications: notif })}>{t('ue.save')}</button>}
          {tab === 'email' && <button className="btn btn-primary" onClick={() => save({ email: emailN.email, email_notifications: emailN })}>{t('ue.save')}</button>}
          {tab === 'sms' && <button className="btn btn-primary" onClick={() => save({ phone: smsN.phone, phone_notifications: smsN })}>{t('ue.save')}</button>}
          {tab === 'lang' && <button className="btn btn-primary" onClick={() => save({ language: form.language })}>{t('ue.save')}</button>}
          {tab === 'restrict' && <button className="btn btn-primary" onClick={() => save({ restrictions: restrict })}>{t('ue.save')}</button>}
        </div>
      </form>
    </div>
  );
}

function toCamel(k) {
  return { new_lead: 'newLead', lead_conversation: 'leadConversation', lead_conversion: 'leadConversion', new_report: 'newReport', daily_leads: 'dailyLeads' }[k];
}
function toggleArr(state, setState, field, val, on) {
  const arr = state[field] || [];
  setState({ ...state, [field]: on ? [...arr, val] : arr.filter((x) => x !== val) });
}
