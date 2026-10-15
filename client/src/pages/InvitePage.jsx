import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, setActiveCompany } from '../api';
import PasswordRules from '../components/PasswordRules';
import logo from '../assets/logo.png';

// Employee accepts a company invite. The email/phone the manager set are locked;
// the employee only fills name, password, and the missing contact field.
// An employee who already has an account signs in and approves: the company is added to that
// account, and they switch between their companies from the header ("connected to").
export default function InvitePage() {
  const { token } = useParams();
  const { acceptInvite, token: session } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();

  const [info, setInfo] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [f, setF] = useState({ full_name: '', password: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.inviteInfo(token).then(setInfo).catch(() => setInvalid(true));
  }, [token]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function join() {
    setBusy(true); setError('');
    try {
      const r = await api.joinInvite(token, session);
      setActiveCompany(String(r.company.id)); // land in the new company
      window.location.assign('/');
    } catch (err) { setError(err.message); setBusy(false); }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { full_name: f.full_name, password: f.password };
      if (!info.email) body.email = f.email;   // employee supplies the missing one
      if (!info.phone) body.phone = f.phone;
      await acceptInvite(token, body);
      nav('/');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (invalid) return (
    <div className="login-wrap"><div className="login-card">
      <img src={logo} alt="LeadClient" className="login-logo" />
      <p className="error">{t('inv.invalid')}</p>
    </div></div>
  );

  const existing = info && info.existing_account;
  if (existing) return (
    <div className="login-wrap"><div className="login-card">
      <img src={logo} alt="LeadClient" className="login-logo" />
      <h2 style={{ textAlign: 'center', margin: '4px 0 0' }}>{t('inv.title')}</h2>
      <p className="muted" style={{ textAlign: 'center', marginTop: 2 }}>{`${t('inv.joining')} ${info.company.name}`}</p>
      {error && <p className="error">{error}</p>}
      {existing === 'other' ? (
        <p className="error">{t('inv.adminAccount')}</p>
      ) : existing === 'same' ? (
        <>
          <p style={{ textAlign: 'center' }}>{t('inv.alreadyMember')}</p>
          <Link className="btn btn-primary" style={{ width: '100%', textAlign: 'center' }} to="/">{t('inv.toLogin')}</Link>
        </>
      ) : (
        <>
          <p style={{ textAlign: 'center' }}>{t('inv.existingHint').replace('{company}', info.company.name)}</p>
          {session ? (
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={join}>
              {busy ? t('common.loading') : t('inv.approveJoin')}
            </button>
          ) : (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => nav(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)}>
              {t('inv.signInToApprove')}
            </button>
          )}
        </>
      )}
    </div></div>
  );

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 0' }}>{t('inv.title')}</h2>
        <p className="muted" style={{ textAlign: 'center', marginTop: 2 }}>
          {info ? `${t('inv.joining')} ${info.company.name}` : t('common.loading')}
        </p>
        {error && <p className="error">{error}</p>}

        <div className="field"><label>{t('reg.fullName')}</label>
          <input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus /></div>

        {/* locked contact from the invite; the other is collected */}
        {info?.email ? (
          <div className="field"><label>{t('ue.email')}</label><input value={info.email} readOnly disabled /></div>
        ) : (
          <div className="field"><label>{t('ue.email')}</label>
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        )}
        {info?.phone ? (
          <div className="field"><label>{t('login.phone')}</label><input value={info.phone} readOnly disabled /></div>
        ) : (
          <div className="field"><label>{t('login.phone')}</label>
            <input type="tel" inputMode="tel" placeholder="05X-XXXXXXX" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        )}

        <div className="field"><label>{t('login.password')}</label>
          <input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} /></div>
        <PasswordRules password={f.password} ctx={{ username: info?.email || f.email, email: info?.email || f.email, display_name: f.full_name }} />

        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !info}>
          {busy ? t('reg.creating') : t('inv.join')}
        </button>
      </form>
    </div>
  );
}
