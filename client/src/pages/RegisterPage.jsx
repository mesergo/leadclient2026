import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import logo from '../assets/logo.png';

// Public trial signup. The agency is taken from the :token in the URL
// (/register/<agency public_token>). Creates a trial company + company_admin.
export default function RegisterPage() {
  const { token } = useParams();
  const { registerAccount } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();

  const [agency, setAgency] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [f, setF] = useState({ company_name: '', full_name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.registerInfo(token).then((d) => setAgency(d.agency)).catch(() => setInvalid(true));
  }, [token]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await registerAccount(token, f); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (invalid) return (
    <div className="login-wrap"><div className="login-card">
      <img src={logo} alt="LeadClient" className="login-logo" />
      <p className="error">{t('reg.invalidLink')}</p>
    </div></div>
  );

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 0' }}>{t('reg.title')}</h2>
        <p className="muted" style={{ textAlign: 'center', marginTop: 2 }}>
          {agency ? `${t('reg.under')} ${agency.name}` : t('common.loading')}
        </p>
        {error && <p className="error">{error}</p>}
        <div className="field"><label>{t('reg.companyName')}</label>
          <input value={f.company_name} onChange={(e) => set('company_name', e.target.value)} autoFocus /></div>
        <div className="field"><label>{t('reg.fullName')}</label>
          <input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></div>
        <div className="field"><label>{t('ue.email')}</label>
          <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="field"><label>{t('login.phone')}</label>
          <input type="tel" inputMode="tel" placeholder="05X-XXXXXXX" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div className="field"><label>{t('login.password')}</label>
          <input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !agency}>
          {busy ? t('reg.creating') : t('reg.create')}
        </button>
      </form>
    </div>
  );
}
