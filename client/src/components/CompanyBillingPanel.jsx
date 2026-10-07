import { useEffect, useState } from 'react';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const money = (v) => (v == null ? '—' : '₪' + Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 }));
const dt = (v) => (v ? new Date(v).toLocaleDateString('he-IL') : '—');
const todayYmd = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

const STATE_CLASS = { ok: 'ok', paused: 'warn', not_found: 'warn', error: 'warn', failing: 'bad', cancelled: 'bad', finished: 'bad' };
const TX_LABEL = { SUCCESS: 'cb.txOk', FAILURE: 'cb.txFail', PENDING: 'cb.txPending' };
const CHARGE_KIND = { first: 'cb.kFirst', monthly: 'cb.kMonthly', trial_usage: 'cb.kTrial', overage: 'cb.kOverage' };

// Live health of the company's standing order, read from iCount on open / refresh.
function StandingOrderStatus({ companyId, token }) {
  const { t } = useLang();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); api.companyBillingLive(companyId, token).then(setD).catch((e) => setD({ live: { state: 'error', error: e.message }, charges: [] })).finally(() => setBusy(false)); };
  useEffect(() => { load(); }, [companyId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <p className="muted">{t('cb.checking')}</p>;
  const L = d.live || { state: 'not_found' };
  const cls = STATE_CLASS[L.state] || 'warn';
  const exp = L.cc_expires ? String(L.cc_expires).slice(5, 7) + '/' + String(L.cc_expires).slice(0, 4) : null;
  return (
    <div style={{ marginTop: 10 }}>
      <div className={'bill-status ' + cls}>
        <strong>{t('cb.st.' + L.state)}</strong>
        {L.state === 'failing' && L.last_error && <div>{L.last_error}</div>}
        {L.state === 'error' && <div>{L.error}</div>}
        {L.mock && <div className="muted" style={{ fontSize: 12 }}>{t('cb.mockLive')}</div>}
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} disabled={busy} onClick={load}>
          {busy ? '...' : t('cb.refresh')}
        </button>
      </div>
      {L.state !== 'not_found' && L.state !== 'error' && (
        <table className="data-table" style={{ marginTop: 10 }}><tbody>
          <tr><th>{t('cb.hkId')}</th><td>{L.hk_id || '—'}</td></tr>
          <tr><th>{t('cb.startDate')}</th><td>{dt(L.start_date)}</td></tr>
          <tr><th>{t('cb.nextDebit')}</th><td>{dt(L.next_debit)}</td></tr>
          <tr><th>{t('cb.lastDebit')}</th><td>{L.last_debit ? `${dt(L.last_debit)} · ${L.last_debit_success ? '✓' : '✗'}` : '—'}</td></tr>
          <tr><th>{t('cb.amount')}</th><td>{money(L.amount)}</td></tr>
          <tr><th>{t('cb.card')}</th><td>{L.cc_last4 ? `${L.cc_type || ''} •••• ${L.cc_last4}${exp ? ` · ${t('cb.cardExp')} ${exp}` : ''}` : '—'}</td></tr>
          {L.payments_done != null && <tr><th>{t('cb.paymentsDone')}</th><td>{L.payments_done}</td></tr>}
        </tbody></table>
      )}
      {L.transactions && L.transactions.length > 0 && (<>
        <h4 style={{ margin: '14px 0 6px' }}>{t('cb.txTitle')}</h4>
        <table className="data-table"><thead><tr><th>{t('cb.txDate')}</th><th>{t('cb.amount')}</th><th>{t('cb.txStatus')}</th><th>{t('cb.txDoc')}</th></tr></thead>
          <tbody>{L.transactions.map((x, i) => (
            <tr key={i}><td>{dt(x.date)}</td><td>{money(x.sum)}</td>
              <td className={x.status === 'FAILURE' ? 'error' : ''}>{t(TX_LABEL[x.status] || 'cb.txPending')}{x.info ? ` — ${x.info}` : ''}</td>
              <td>{x.docnum || '—'}</td></tr>
          ))}</tbody></table>
      </>)}
      {d.charges && d.charges.length > 0 && (<>
        <h4 style={{ margin: '14px 0 6px' }}>{t('cb.chargesTitle')}</h4>
        <table className="data-table"><thead><tr><th>{t('cb.txDate')}</th><th>{t('cb.kind')}</th><th>{t('cb.amount')}</th><th>{t('cb.txStatus')}</th></tr></thead>
          <tbody>{d.charges.map((x, i) => (
            <tr key={i}><td>{dt(x.created_at)}</td>
              <td>{t(CHARGE_KIND[x.kind] || 'cb.kOther')}{x.minutes != null ? ` (${x.minutes} ${t('cb.min')})` : ''}</td>
              <td>{money(x.amount)}</td><td className={x.status === 'failed' ? 'error' : ''}>{x.status}{x.error ? ` — ${x.error}` : ''}</td></tr>
          ))}</tbody></table>
      </>)}
    </div>
  );
}

// Company "Subscription & billing" tab (managers): shows the active standing order,
// or lets the manager create a /pay/<token> link to send to the customer.
export default function CompanyBillingPanel({ companyId, token }) {
  const { t } = useLang();
  const [st, setSt] = useState(null);
  const [packages, setPackages] = useState([]);
  const [form, setForm] = useState({ package_id: '', start_date: todayYmd(), email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = () => api.companyBilling(companyId, token).then((d) => {
    setSt(d);
    setForm((f) => ({ ...f, email: f.email || d.defaults.email, phone: f.phone || d.defaults.phone,
      package_id: f.package_id || (d.defaults.package_id ? String(d.defaults.package_id) : '') }));
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [companyId, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.packages(token).then((d) => setPackages((d.packages || []).filter((p) => Number(p.monthly_price) > 0))).catch(() => {}); }, [token]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function createLink() {
    setBusy(true); setError('');
    try { await api.createBillingLink(companyId, form, token); await load(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  }
  async function revoke() {
    if (!window.confirm(t('cb.confirmRevoke'))) return;
    try { await api.revokeBillingLink(companyId, token); await load(); } catch (e) { setError(e.message); }
  }

  if (!st) return error ? <p className="error">{error}</p> : <p className="muted">{t('common.loading')}</p>;
  const linkUrl = st.link ? `${window.location.origin}${st.link.path}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ }
  };
  const sub = st.subscription;

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {sub ? (
        <>
          <div className="billing-trial-note">
            <strong>{sub.status === 'past_due' ? t('cb.pastDue') : t('cb.active')}</strong>
            <div>{t('cb.package')}: {sub.package_name || '—'} · {money(sub.monthly_price)} {t('bill.perMonth')} ({t('bill.inclVat')})</div>
            <div>{t('cb.activated')}: {dt(sub.activated_at)}</div>
          </div>
          <StandingOrderStatus companyId={companyId} token={token} />
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{st.is_trial ? t('cb.noneTrial') : t('cb.none')}</p>

          {st.link && (
            <div className="billing-trial-note">
              <strong>{t('cb.openLink')}</strong>
              <div>{st.link.package_name} · {money(st.link.monthly_price)} · {t('cb.startDate')}: {dt(st.link.start_date)} · {t('cb.expires')}: {dt(st.link.expires_at)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 220 }} />
                <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? t('agedit.copied') : t('agedit.copy')}</button>
                <button type="button" className="btn btn-secondary" onClick={revoke}>{t('cb.revoke')}</button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t('cb.linkHint')}</div>
            </div>
          )}

          {!st.enabled ? (
            <p className="error">{t('cb.disabled')}</p>
          ) : (
            <>
              <h3 style={{ margin: '14px 0 6px' }}>{st.link ? t('cb.newLinkReplace') : t('cb.newLink')}</h3>
              <div className="form-field"><label>{t('cb.package')}</label><div className="form-field-control">
                <select value={form.package_id} onChange={(e) => set('package_id', e.target.value)}>
                  <option value="">—</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.monthly_price)})</option>)}
                </select></div></div>
              <div className="form-field"><label>{t('cb.startDate')}</label><div className="form-field-control">
                <input type="date" min={todayYmd()} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('cb.email')}</label><div className="form-field-control">
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('cb.phone')}</label><div className="form-field-control">
                <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div></div>
              <p className="muted" style={{ fontSize: 12 }}>{t('cb.formHint')}</p>
              <button type="button" className="btn btn-primary" disabled={busy || !form.package_id} onClick={createLink}>
                {busy ? '...' : t('cb.create')}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
