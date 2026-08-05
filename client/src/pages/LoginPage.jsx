import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
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
        <h1>LeadClient</h1>
        {error && <p className="error">{error}</p>}
        <div className="field"><label>שם משתמש</label><input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></div>
        <div className="field"><label>סיסמה</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'מתחבר...' : 'התחברות'}</button>
      </form>
    </div>
  );
}
