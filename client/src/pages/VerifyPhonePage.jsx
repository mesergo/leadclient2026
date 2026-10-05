import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import PhoneVerify from '../components/PhoneVerify';
import logo from '../assets/logo.png';

// Shown instead of the app when a signed-in user's phone isn't verified yet.
// Verifying lets them in; they can also log out.
export default function VerifyPhonePage() {
  const { token, user, refreshUser, logout } = useAuth();
  const { t } = useLang();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 2px' }}>{t('pv.gateTitle')}</h2>
        <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>{t('pv.gateSubtitle')}</p>
        <PhoneVerify token={token} initialPhone={user?.phone || ''} verified={false} onVerified={refreshUser} />
        <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 18 }} onClick={logout}>{t('header.logout')}</button>
      </div>
    </div>
  );
}
