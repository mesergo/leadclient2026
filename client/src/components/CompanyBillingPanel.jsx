import { useEffect, useState } from 'react';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const money = (v) => (v == null ? '—' : '₪' + Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 }));
const dt = (v) => (v ? new Date(v).toLocaleDateString('he-IL') : '—');
const todayYmd = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

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
        <div className="billing-trial-note">
          <strong>{sub.status === 'past_due' ? t('cb.pastDue') : t('cb.active')}</strong>
          <div>{t('cb.package')}: {sub.package_name || '—'} · {money(sub.monthly_price)} {t('bill.perMonth')} ({t('bill.inclVat')})</div>
          {sub.cc_last4 && <div>{t('cb.card')}: •••• {sub.cc_last4}</div>}
          <div>{t('cb.activated')}: {dt(sub.activated_at)}{sub.next_debit ? ` · ${t('cb.nextDebit')}: ${dt(sub.next_debit)}` : ''}</div>
        </div>
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
