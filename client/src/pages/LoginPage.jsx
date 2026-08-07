import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import logo from '../assets/logo.png';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(username, password); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="LeadClient" className="login-logo" />
        {error && <p className="error">{error}</p>}
        <div className="field"><label>{t('login.username')}</label><input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></div>
        <div className="field"><label>{t('login.password')}</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? t('login.signing') : t('login.signin')}</button>
      </form>
    </div>
  );
}
