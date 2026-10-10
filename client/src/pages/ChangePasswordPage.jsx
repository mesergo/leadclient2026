import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import PasswordRules from '../components/PasswordRules';
import { isStrongPassword } from '../passwordPolicy';
import logo from '../assets/logo.png';

// Shown instead of the app when the server flagged the account (must_change_password):
// the password used at login no longer meets the policy. Changing it lets them in.
export default function ChangePasswordPage() {
  const { token, user, refreshUser, logout } = useAuth();
  const { t } = useLang();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ctx = { username: user?.username, email: user?.email, display_name: user?.display_name || user?.name };

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!isStrongPassword(next, ctx)) return setError(t('pw.weak'));
    if (next !== confirm) return setError(t('ue.pwMismatch'));
    setBusy(true);
    try {
      await api.updatePassword({ current_password: current, new_password: next }, token);
      await refreshUser(); // must_change_password is now 0 -> the gate lets them in
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 2px' }}>{t('pw.force.title')}</h2>
        <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>{t('pw.force.text')}</p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit}>
          <div className="field"><label>{t('ue.currentPassword')}</label>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus /></div>
          <div className="field"><label>{t('ue.newPassword')}</label>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <PasswordRules password={next} ctx={ctx} />
          <div className="field"><label>{t('ue.confirmPassword')}</label>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !current || !next || !confirm}>{t('pw.force.submit')}</button>
        </form>
        <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={logout}>{t('pw.force.logout')}</button>
      </div>
    </div>
  );
}
