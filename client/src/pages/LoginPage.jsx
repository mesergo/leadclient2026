import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import GoogleButton from '../components/GoogleButton';
import logo from '../assets/logo.png';

export default function LoginPage() {
  const { login, loginWithPhone, loginWithGoogle } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [mode, setMode] = useState('password'); // 'password' | 'phone'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // phone-OTP state
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitPassword(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(username, password); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function requestCode(e) {
    e.preventDefault();
    setBusy(true); setError(''); setHint('');
    try {
      const r = await api.phoneRequest(phone);
      setSent(true);
      if (r.devCode) setHint(`${t('login.devCode')}: ${r.devCode}`); // mock mode only
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await loginWithPhone(phone, code); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function onGoogle(credential) {
    setError('');
    try { await loginWithGoogle(credential); nav('/'); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src={logo} alt="LeadClient" className="login-logo" />

        <div className="seg" style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <button type="button" className={'btn ' + (mode === 'password' ? 'btn-primary' : 'btn-secondary')} style={{ flex: 1 }}
            onClick={() => { setMode('password'); setError(''); }}>{t('login.byPassword')}</button>
          <button type="button" className={'btn ' + (mode === 'phone' ? 'btn-primary' : 'btn-secondary')} style={{ flex: 1 }}
            onClick={() => { setMode('phone'); setError(''); }}>{t('login.byPhone')}</button>
        </div>

        {error && <p className="error">{error}</p>}

        {mode === 'password' && (
          <form onSubmit={submitPassword}>
            <div className="field"><label>{t('login.username')}</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></div>
            <div className="field"><label>{t('login.password')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? t('login.signing') : t('login.signin')}</button>
          </form>
        )}

        {mode === 'phone' && !sent && (
          <form onSubmit={requestCode}>
            <div className="field"><label>{t('login.phone')}</label>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05X-XXXXXXX" autoFocus /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !phone}>{busy ? t('login.sending') : t('login.sendCode')}</button>
          </form>
        )}

        {mode === 'phone' && sent && (
          <form onSubmit={verifyCode}>
            <p className="muted" style={{ marginTop: 0 }}>{t('login.codeSentTo')} {phone}</p>
            {hint && <p className="muted" style={{ color: 'var(--accent, #b45309)' }}>{hint}</p>}
            <div className="field"><label>{t('login.code')}</label>
              <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || code.length < 4}>{busy ? t('login.signing') : t('login.verifyAndSignin')}</button>
            <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }}
              onClick={() => { setSent(false); setCode(''); setHint(''); setError(''); }}>{t('login.changePhone')}</button>
          </form>
        )}

        <div className="google-slot" style={{ marginTop: 18 }}>
          <GoogleButton onCredential={onGoogle} onError={() => setError(t('login.googleError'))} />
        </div>
      </div>
    </div>
  );
}
