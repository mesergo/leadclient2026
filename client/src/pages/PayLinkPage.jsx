import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import logo from '../assets/logo.png';

const money = (v) => '₪' + Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 });

// Public billing page a manager sends to a customer (/pay/<token>). No login.
// "Continue" opens a fresh iCount PayPage (standing order); back here with
// ?status=done we wait for the subscription to become active.
export default function PayLinkPage() {
  const { token } = useParams();
  const { t } = useLang();
  const ret = new URLSearchParams(window.location.search).get('status'); // done|failed|cancelled|mock
  const [info, setInfo] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(ret === 'failed' ? t('bill.failed') : ret === 'cancelled' ? t('bill.cancelled') : '');
  const [verifying, setVerifying] = useState(ret === 'done');
  const [mockOpen, setMockOpen] = useState(ret === 'mock');

  const clearQuery = () => window.history.replaceState(null, '', window.location.pathname);
  const load = () => api.payLink(token).then(setInfo).catch(() => setInvalid(true));

  useEffect(() => {
    if (ret !== 'done') { load(); return undefined; }
    let tries = 0, stopped = false;
    const poll = async () => {
      try {
        const r = await api.payLinkVerify(token);
        setInfo(r);
        if (r.status === 'active') { setVerifying(false); clearQuery(); return; }
      } catch { /* retry */ }
      if (stopped) return;
      if (++tries < 20) setTimeout(poll, 3000);
      else { setVerifying(false); setError(t('bill.verifyTimeout')); clearQuery(); }
    };
    poll();
    return () => { stopped = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    setBusy(true); setError('');
    try {
      const r = await api.payLinkCheckout(token);
      if (r.mock) { setMockOpen(true); setBusy(false); return; }
      window.location.href = r.url;
    } catch (e) { setError(e.message); setBusy(false); }
  }
  async function mockPay() {
    setBusy(true); setError('');
    try { await api.payLinkMockComplete(token); clearQuery(); setMockOpen(false); await load(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  }

  const startDate = info && info.start_date ? new Date(info.start_date).toLocaleDateString('he-IL') : '';
  const startsToday = info && info.start_date && new Date(info.start_date) <= new Date();

  let body;
  if (invalid) body = <p className="error" style={{ textAlign: 'center' }}>{t('pay.invalid')}</p>;
  else if (!info) body = <p className="muted" style={{ textAlign: 'center' }}>{t('common.loading')}</p>;
  else if (verifying) body = <p style={{ textAlign: 'center' }}>{t('bill.verifying')}</p>;
  else if (info.status === 'active' || info.status === 'past_due') {
    body = (
      <div className="billing-trial-note" style={{ textAlign: 'center' }}>
        <strong>{t('pay.thanks')}</strong>
        <div>{t('pay.activeNote').replace('{pkg}', info.package.name)}</div>
      </div>
    );
  } else if (info.status !== 'pending') {
    body = <p className="error" style={{ textAlign: 'center' }}>{info.status === 'expired' ? t('pay.expired') : t('pay.inactive')}</p>;
  } else {
    body = (
      <>
        <p style={{ textAlign: 'center', margin: '0 0 6px' }}>{t('pay.forCompany')} <strong>{info.company_name}</strong></p>
        {error && <p className="error">{error}</p>}
        <div className="billing-pkg selected" style={{ cursor: 'default', width: '100%' }}>
          <div className="billing-pkg-name">{info.package.name}</div>
          <div className="billing-pkg-price">{money(info.package.monthly_price)} <span>{t('bill.perMonth')}</span></div>
          <div className="billing-pkg-vat">{t('bill.inclVat')}</div>
        </div>
        <div className="billing-trial-note">
          {startsToday ? t('pay.startsNow') : t('pay.startsOn').replace('{date}', startDate)}
        </div>
        {mockOpen ? (
          <div className="billing-trial-note" style={{ borderColor: '#e67e22' }}>
            <div>{t('bill.mockNote')}</div>
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={mockPay}>{t('bill.mockPay')}</button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={pay}>
            {busy ? t('bill.redirecting') : t('bill.continue')}
          </button>
        )}
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>{t('bill.secureNote')}</p>
      </>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 480, width: '100%' }}>
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 10px' }}>{t('pay.title')}</h2>
        {body}
      </div>
    </div>
  );
}
