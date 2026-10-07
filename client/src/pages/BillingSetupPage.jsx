import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import logo from '../assets/logo.png';

const money = (v) => '₪' + Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const quota = (v) => (v == null ? '∞' : Number(v).toLocaleString('he-IL'));

// Shown instead of the app while a self-registered company has no standing order yet:
// pick a package (or the one locked by the signup link) -> iCount PayPage -> back here
// with ?billing=done, where we wait for the subscription to become active.
export default function BillingSetupPage({ state, onDone }) {
  const { token, logout } = useAuth();
  const { t } = useLang();
  const mode = new URLSearchParams(window.location.search).get('billing'); // done|failed|cancelled|mock
  const [sel, setSel] = useState(state.locked ? state.selected_package_id : (state.packages[0] ? state.packages[0].id : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(mode === 'failed' ? t('bill.failed') : mode === 'cancelled' ? t('bill.cancelled') : '');
  const [verifying, setVerifying] = useState(mode === 'done');
  const [mockOpen, setMockOpen] = useState(mode === 'mock');

  const clearQuery = () => window.history.replaceState(null, '', window.location.pathname);

  // back from the PayPage: the IPN (or a lookup in iCount) activates the subscription
  useEffect(() => {
    if (mode !== 'done') return undefined;
    let tries = 0, stopped = false;
    const poll = async () => {
      try {
        const r = await api.subscriptionVerify(token);
        if (r.status === 'active') { clearQuery(); onDone(); return; }
      } catch { /* retry */ }
      if (stopped) return;
      if (++tries < 20) setTimeout(poll, 3000);
      else { setVerifying(false); setError(t('bill.verifyTimeout')); clearQuery(); }
    };
    poll();
    return () => { stopped = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    if (!sel) { setError(t('bill.pickPkg')); return; }
    setBusy(true); setError('');
    try {
      const r = await api.subscriptionCheckout(token, sel);
      if (r.mock) { setMockOpen(true); setBusy(false); return; }
      window.location.href = r.url;
    } catch (e) { setError(e.message); setBusy(false); }
  }
  async function mockPay() {
    setBusy(true); setError('');
    try { await api.subscriptionMockComplete(token); clearQuery(); onDone(); }
    catch (e) { setError(e.message); setBusy(false); }
  }

  const trialEnd = state.trial_ends_at ? new Date(state.trial_ends_at).toLocaleDateString('he-IL') : '';
  const rate = Math.round(Number(state.trial_minute_rate) * 100);

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 680, width: '100%' }}>
        <img src={logo} alt="LeadClient" className="login-logo" />
        <h2 style={{ textAlign: 'center', margin: '4px 0 2px' }}>{t('bill.title')}</h2>

        {verifying ? (
          <p style={{ textAlign: 'center' }}>{t('bill.verifying')}</p>
        ) : !state.can_pay ? (
          <p className="muted" style={{ textAlign: 'center' }}>{t('bill.waitAdmin')}</p>
        ) : (
          <>
            <div className="billing-trial-note">
              <strong>{t('bill.trialTitle').replace('{days}', state.trial_days)}</strong>
              <div>{t('bill.trialCalls').replace('{rate}', rate)}</div>
              <div>{t('bill.trialThen').replace('{date}', trialEnd)}</div>
            </div>

            {error && <p className="error">{error}</p>}
            {!state.packages.length && <p className="muted">{t('bill.noPackages')}</p>}

            <div className="billing-pkgs">
              {state.packages.map((p) => (
                <button type="button" key={p.id}
                  className={'billing-pkg' + (Number(sel) === Number(p.id) ? ' selected' : '')}
                  onClick={() => !state.locked && setSel(p.id)} disabled={busy}>
                  <div className="billing-pkg-name">{p.name}</div>
                  <div className="billing-pkg-price">{money(p.monthly_price)} <span>{t('bill.perMonth')}</span></div>
                  <div className="billing-pkg-vat">{t('bill.inclVat')}</div>
                  <ul>
                    <li>{t('quota.users')}: {quota(p.quota_users)}</li>
                    <li>{t('quota.numbers')}: {quota(p.quota_numbers)}</li>
                    <li>{t('quota.leads')}: {quota(p.quota_leads)}</li>
                    <li>{t('quota.channels')}: {quota(p.quota_channels)}</li>
                  </ul>
                </button>
              ))}
            </div>

            {mockOpen ? (
              <div className="billing-trial-note" style={{ borderColor: '#e67e22' }}>
                <div>{t('bill.mockNote')}</div>
                <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={mockPay}>{t('bill.mockPay')}</button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={busy || !sel} onClick={pay}>
                {busy ? t('bill.redirecting') : t('bill.continue')}
              </button>
            )}
            <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>{t('bill.secureNote')}</p>
          </>
        )}
        <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 14 }} onClick={logout}>{t('header.logout')}</button>
      </div>
    </div>
  );
}
