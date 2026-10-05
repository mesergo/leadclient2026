import { useState } from 'react';
import { useLang } from '../context/LangContext';
import { api } from '../api';

// Reusable mobile-verification widget. Enter a number -> receive an OTP (SMS /
// voice) -> enter the code -> verified. Used both in the profile and in the
// mandatory pre-entry gate. Calls onVerified() after a successful confirm.
export default function PhoneVerify({ token, initialPhone = '', verified = false, onVerified }) {
  const { t } = useLang();
  const [phone, setPhone] = useState(initialPhone || '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('idle');   // 'idle' | 'sent'
  const [editing, setEditing] = useState(!verified);
  const [hint, setHint] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true); setError(''); setMsg(''); setHint('');
    try {
      const r = await api.phoneVerifyRequest(token, phone);
      setStep('sent');
      if (r.devCode) setHint(`${t('login.devCode')}: ${r.devCode}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function confirm(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.phoneVerifyConfirm(token, code);
      setStep('idle'); setEditing(false); setCode(''); setHint('');
      setMsg(t('pv.verified'));
      if (onVerified) onVerified();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (verified && !editing) {
    return (
      <div>
        <p className="success-note" style={{ marginTop: 0 }}>✓ {t('pv.isVerified')} {phone}</p>
        <button type="button" className="btn btn-secondary" onClick={() => { setEditing(true); setStep('idle'); }}>{t('pv.changeNumber')}</button>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="success-note">{msg}</p>}

      {step === 'idle' && (
        <form onSubmit={sendCode}>
          <div className="form-field"><label>{t('login.phone')}</label><div className="form-field-control">
            <input type="tel" inputMode="tel" value={phone} placeholder="05X-XXXXXXX"
              onChange={(e) => setPhone(e.target.value)} /></div></div>
          <button className="btn btn-primary" disabled={busy || !phone}>{busy ? t('login.sending') : t('login.sendCode')}</button>
        </form>
      )}

      {step === 'sent' && (
        <form onSubmit={confirm}>
          <p className="muted" style={{ marginTop: 0 }}>{t('login.codeSentTo')} {phone}</p>
          {hint && <p className="muted" style={{ color: '#b45309' }}>{hint}</p>}
          <div className="form-field"><label>{t('login.code')}</label><div className="form-field-control">
            <input inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></div></div>
          <button className="btn btn-primary" disabled={busy || code.length < 4}>{busy ? t('login.signing') : t('pv.confirm')}</button>
          <button type="button" className="btn btn-secondary" style={{ marginInlineStart: 8 }}
            onClick={() => { setStep('idle'); setCode(''); setHint(''); setError(''); }}>{t('login.changePhone')}</button>
        </form>
      )}
    </div>
  );
}
