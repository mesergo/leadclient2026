import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import GoogleButton from '../components/GoogleButton';
import logo from '../assets/logo.png';

const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e || '');
function phoneOk(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^00/, '').replace(/^0+/, '0');
  return /^972\d{8,9}$/.test(d) || /^0\d{8,9}$/.test(d);
}

// Public trial signup. Agency from the :token (/register/<token>) or the default
// agency (/register). Password form with per-field validation, or Google signup
// followed by a "complete details" step (company + phone) then phone verification.
export default function RegisterPage() {
  const { token } = useParams();
  const [sp] = useSearchParams();
  const pkg = sp.get('pkg') || '';
  const { registerAccount, registerWithGoogle } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();

  const [agency, setAgency] = useState(null);
  const [pkgName, setPkgName] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [f, setF] = useState({ company_name: '', full_name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // google "complete details" step
  const [gCred, setGCred] = useState(null);
  const [gInfo, setGInfo] = useState(null); // { email, name }
  const [gForm, setGForm] = useState({ company_name: '', phone: '' });

  useEffect(() => {
    api.registerInfo(token, pkg).then((d) => { setAgency(d.agency); setPkgName(d.package ? d.package.name : ''); }).catch(() => setInvalid(true));
  }, [token, pkg]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function validate() {
    if (!f.company_name.trim()) return t('reg.errCompany');
    if (!f.full_name.trim()) return t('reg.errName');
    if (!f.email.trim()) return t('reg.errEmailMissing');
    if (!emailOk(f.email)) return t('reg.errEmailInvalid');
    if (!f.phone.trim()) return t('reg.errPhoneMissing');
    if (!phoneOk(f.phone)) return t('reg.errPhoneInvalid');
    if (!f.password) return t('reg.errPassMissing');
    if (f.password.length < 6) return t('reg.errPassShort');
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true); setError('');
    try { await registerAccount(token, { ...f, pkg }); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function onGoogle(credential) {
    setError(''); setBusy(true);
    try {
      const r = await api.googlePrecheck(credential);
      if (r.exists) { await registerWithGoogle(token, credential); nav('/'); return; }
      setGCred(credential); setGInfo({ email: r.email, name: r.name });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function submitGoogle(e) {
    e.preventDefault();
    if (!gForm.company_name.trim()) { setError(t('reg.errCompany')); return; }
    if (!gForm.phone.trim()) { setError(t('reg.errPhoneMissing')); return; }
    if (!phoneOk(gForm.phone)) { setError(t('reg.errPhoneInvalid')); return; }
    setBusy(true); setError('');
    try { await registerWithGoogle(token, gCred, { ...gForm, pkg }); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (invalid) return (
    <div className="login-wrap"><div className="login-card">
      <img src={logo} alt="LeadClient" className="login-logo" />
      <p className="error">{t('reg.invalidLink')}</p>
    </div></div>
  );

  // Google "complete details" step
  if (gCred) return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submitGoogle}>
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 0' }}>{t('reg.googleComplete')}</h2>
        <p className="muted" style={{ textAlign: 'center', marginTop: 2 }}>{gInfo?.name} · {gInfo?.email}</p>
        {error && <p className="error">{error}</p>}
        <div className="field"><label>{t('reg.companyName')}</label>
          <input value={gForm.company_name} onChange={(e) => setGForm((p) => ({ ...p, company_name: e.target.value }))} autoFocus /></div>
        <div className="field"><label>{t('login.phone')}</label>
          <input type="tel" inputMode="tel" placeholder="05X-XXXXXXX" value={gForm.phone} onChange={(e) => setGForm((p) => ({ ...p, phone: e.target.value }))} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? t('reg.creating') : t('reg.continue')}</button>
      </form>
    </div>
  );

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 0' }}>{t('reg.title')}</h2>
        <p className="muted" style={{ textAlign: 'center', marginTop: 2 }}>
          {agency ? `${t('reg.under')} ${agency.name}` : t('common.loading')}
        </p>
        {pkgName && (
          <p style={{ textAlign: 'center', marginTop: 2 }}>
            <span className="tag-chip" style={{ background: '#4f46e522', color: '#4f46e5' }}>{t('reg.package')}: {pkgName}</span>
          </p>
        )}
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
        <div style={{ marginTop: 16 }}>
          <GoogleButton onCredential={onGoogle} onError={() => setError(t('login.googleError'))} />
        </div>
      </form>
    </div>
  );
}
