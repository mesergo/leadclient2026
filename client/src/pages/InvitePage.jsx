import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import logo from '../assets/logo.png';

// Employee accepts a company invite. The email/phone the manager set are locked;
// the employee only fills name, password, and the missing contact field.
export default function InvitePage() {
  const { token } = useParams();
  const { acceptInvite } = useAuth();
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

        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !info}>
          {busy ? t('reg.creating') : t('inv.join')}
        </button>
      </form>
    </div>
  );
}
