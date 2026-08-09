import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function BillingPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const isSuper = user?.role === 'super_admin';
  const isAgency = user?.role === 'agency_admin';

  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [flt, setFlt] = useState({ month: thisMonth(), agency: '', company_id: '' });
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('usage');
  const [prices, setPrices] = useState(null);
  const [packages, setPackages] = useState([]);
  const [priceForm, setPriceForm] = useState({});
  const [editPkg, setEditPkg] = useState(null); // package being edited/created
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const decodeSign = (s) => String(s ?? '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

  // heavy usage aggregation (only the rows)
  const load = (f = flt) => api.billing(token, { month: f.month, agency: f.agency || undefined, company_id: f.company_id || undefined })
    .then((d) => setRows(d.rows)).catch((e) => setError(e.message));

  // fast prices + packages
  const loadPrices = () => api.billingPrices(token).then((d) => {
    setPrices(d.prices); setPackages(d.packages || []);
    if (d.prices) setPriceForm({
      currency_sign: decodeSign(d.prices.currency_sign) || '₪',
      virtual_phone_minute: d.prices.virtual_phone_minute ?? '', lead_price: d.prices.lead_price ?? '',
      premium_virtual_phone: d.prices.premium_virtual_phone ?? '', regular_virtual_phone: d.prices.regular_virtual_phone ?? '',
      sms_price: d.prices.sms_price ?? '', tax_percent: d.prices.tax_percent ?? '',
    });
  }).catch((e) => setError(e.message));

  const savePrices = async () => {
    setMsg(''); setError('');
    try { const d = await api.updateBillingPrices(priceForm, token); setPrices(d.prices); setMsg(t('bil.pricesSaved')); }
    catch (e) { setError(e.message); }
  };
  const setP = (k, v) => setPriceForm((f) => ({ ...f, [k]: v }));

  // package editor
  const blankPkg = () => ({ name: '', subtitle: '', price: '', original_price: '', setup_fee: 0, is_popular: 0, users: '', companies: '', phones: '', leads: '', additional_minute_price: '', additional_phone_price: '', featuresText: '' });
  const openNewPkg = () => setEditPkg(blankPkg());
  const openEditPkg = (p) => setEditPkg({ ...p, featuresText: (p.features || []).join('\n') });
  const savePkg = async () => {
    const body = { ...editPkg, features: (editPkg.featuresText || '').split('\n').map((s) => s.trim()).filter(Boolean) };
    delete body.featuresText; delete body.features_raw;
    try {
      if (editPkg.id) await api.updatePackage(editPkg.id, body, token);
      else await api.createPackage(body, token);
      setEditPkg(null); loadPrices();
    } catch (e) { setError(e.message); }
  };
  const delPkg = async (id) => { try { await api.deletePackage(id, token); loadPrices(); } catch (e) { setError(e.message); } };

  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    if (isSuper || isAgency) api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
    loadPrices();
    load();
  }, [token]);

  const agencyCompanies = useMemo(
    () => (flt.agency ? companies.filter((c) => String(c.agency_id) === String(flt.agency)) : companies),
    [companies, flt.agency]
  );
  const num = (n) => Number(n || 0).toLocaleString();

  const totals = useMemo(() => rows.reduce((a, r) => ({
    numbers: a.numbers + r.numbers, calls: a.calls + r.calls, minutes: a.minutes + r.minutes, sms: a.sms + r.sms, leads: a.leads + r.leads,
  }), { numbers: 0, calls: 0, minutes: 0, sms: 0, leads: 0 }), [rows]);

  return (
    <div>
      <div className="page-header"><h1>{t('nav.billing')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>{t('bil.subtitle')}</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      {isSuper && (
        <div className="tabs">
          <button className={'tab' + (tab === 'usage' ? ' active' : '')} onClick={() => setTab('usage')}>{t('bil.tabUsage')}</button>
          <button className={'tab' + (tab === 'prices' ? ' active' : '')} onClick={() => setTab('prices')}>{t('bil.tabPrices')}</button>
        </div>
      )}

      {isSuper && tab === 'prices' && (
        <div className="billing-prices">
          <form className="form-panel" onSubmit={(e) => { e.preventDefault(); savePrices(); }}>
            <div className="form-panel-body">
              <div className="form-field"><label>{t('bil.pMinute')}</label><div className="form-field-control"><input type="number" step="0.01" value={priceForm.virtual_phone_minute} onChange={(e) => setP('virtual_phone_minute', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('bil.pLead')}</label><div className="form-field-control"><input type="number" step="0.01" value={priceForm.lead_price} onChange={(e) => setP('lead_price', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('bil.pPremiumPhone')}</label><div className="form-field-control"><input type="number" step="0.01" value={priceForm.premium_virtual_phone} onChange={(e) => setP('premium_virtual_phone', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('bil.pRegularPhone')}</label><div className="form-field-control"><input type="number" step="0.01" value={priceForm.regular_virtual_phone} onChange={(e) => setP('regular_virtual_phone', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('bil.pSms')}</label><div className="form-field-control"><input type="number" step="0.01" value={priceForm.sms_price} onChange={(e) => setP('sms_price', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('bil.pTax')}</label><div className="form-field-control"><input type="number" step="0.1" value={priceForm.tax_percent} onChange={(e) => setP('tax_percent', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('bil.pCurrency')}</label><div className="form-field-control"><input value={priceForm.currency_sign} onChange={(e) => setP('currency_sign', e.target.value)} style={{ maxWidth: 80 }} /></div></div>
            </div>
            <div className="form-actions"><button className="btn btn-primary">{t('common.save')}</button></div>
          </form>

          <div className="page-header" style={{ marginTop: '1.5rem' }}>
            <h2>{t('bil.packagesOverride')}</h2>
            <button className="btn btn-primary" onClick={openNewPkg}>+ {t('bil.addPackage')}</button>
          </div>
          <div className="pkg-grid">
            {packages.map((p) => (
              <div key={p.id} className={'pkg-card' + (p.is_popular ? ' popular' : '')}>
                {p.is_popular ? <div className="pkg-badge">{t('bil.popular')}</div> : null}
                <div className="pkg-actions">
                  <button className="cell-edit-btn" title={t('co.edit')} onClick={() => openEditPkg(p)}><Icons.Pencil size={14} /></button>
                  <button className="cell-edit-btn" title="×" onClick={() => { if (window.confirm(t('bil.delPackage'))) delPkg(p.id); }}><Icons.Trash size={14} /></button>
                </div>
                <h3 className="pkg-name">{p.name}</h3>
                <div className="pkg-subtitle">{p.subtitle}</div>
                <div className="pkg-price">
                  {p.original_price ? <span className="pkg-orig">{num(p.original_price)}{priceForm.currency_sign}</span> : null}
                  <span className="pkg-amount">{num(p.price)}{priceForm.currency_sign}</span>
                  <span className="pkg-per">{t('bil.perMonth')}</span>
                </div>
                <div className="pkg-setup">{t('bil.setupFee')}: {num(p.setup_fee || 0)}{priceForm.currency_sign} ({t('bil.oneTime')})</div>
                <ul className="pkg-features">
                  {(p.features || []).map((f, i) => <li key={i}>✓ {f}</li>)}
                </ul>
              </div>
            ))}
          </div>

          {editPkg && (
            <div className="lead-modal-overlay" onClick={() => setEditPkg(null)}>
              <div className="lead-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="lead-card-head"><h2>{editPkg.id ? t('bil.editPackage') : t('bil.newPackage')}</h2>
                  <button className="icon-btn" onClick={() => setEditPkg(null)}>×</button></div>
                <div className="form-panel-body">
                  {[['name', t('common.name')], ['subtitle', 'תת-כותרת'], ['price', t('bil.price')], ['original_price', 'מחיר מקורי'],
                    ['setup_fee', t('bil.setupFee')], ['users', t('bil.users')], ['companies', t('common.company')], ['phones', t('bil.phones')],
                    ['leads', t('bil.leadsCol')], ['additional_minute_price', t('bil.pMinute')], ['additional_phone_price', t('bil.pRegularPhone')]].map(([k, lbl]) => (
                    <div className="form-field" key={k}><label>{lbl}</label><div className="form-field-control">
                      <input value={editPkg[k] ?? ''} onChange={(e) => setEditPkg({ ...editPkg, [k]: e.target.value })} /></div></div>
                  ))}
                  <label className="notif-row"><input type="checkbox" checked={!!editPkg.is_popular} onChange={(e) => setEditPkg({ ...editPkg, is_popular: e.target.checked ? 1 : 0 })} /> {t('bil.popular')}</label>
                  <div className="form-field"><label>{t('bil.features')}</label><div className="form-field-control">
                    <textarea rows={7} value={editPkg.featuresText} onChange={(e) => setEditPkg({ ...editPkg, featuresText: e.target.value })} /></div></div>
                </div>
                <div className="form-actions"><button className="btn btn-primary" onClick={savePkg}>{t('common.save')}</button></div>
              </div>
            </div>
          )}
          {packages.length === 0 && <p className="muted">{t('common.none')}</p>}
        </div>
      )}

      {(!isSuper || tab === 'usage') && (<>
      <div className="panel dash-filter">
        <div className="filter-row">
          <label className="filter-item"><span>{t('bil.month')}</span>
            <input type="month" value={flt.month} onChange={(e) => setFlt({ ...flt, month: e.target.value })} />
          </label>
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={flt.agency} onChange={(e) => setFlt({ ...flt, agency: e.target.value, company_id: '' })}>
                <option value="">{t('common.all')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          )}
          {(isSuper || isAgency) && (
            <label className="filter-item"><span>{t('common.company')}</span>
              <select value={flt.company_id} onChange={(e) => setFlt({ ...flt, company_id: e.target.value })}>
                <option value="">{t('common.all')}</option>
                {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          )}
          <button className="btn btn-primary" onClick={() => load()}>{t('dash.show')}</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="stat-grid">
          <div className="stat-tile stat-cyan"><div><div className="num">{num(totals.numbers)}</div><div className="lbl">{t('bil.numbers')}</div></div></div>
          <div className="stat-tile stat-green"><div><div className="num">{num(totals.calls)}</div><div className="lbl">{t('bil.calls')}</div></div></div>
          <div className="stat-tile stat-amber"><div><div className="num">{num(totals.minutes)}</div><div className="lbl">{t('bil.minutes')}</div></div></div>
          <div className="stat-tile stat-pink"><div><div className="num">{num(totals.sms)}</div><div className="lbl">{t('bil.sms')}</div></div></div>
          <div className="stat-tile stat-gold"><div><div className="num">{num(totals.leads)}</div><div className="lbl">{t('bil.leadsCol')}</div></div></div>
        </div>
      )}

      <div className="table-wrap"><table className="data-table">
        <thead><tr>
          {(isSuper || isAgency) && <th>{t('common.agency')}</th>}
          <th>{t('common.company')}</th>
          <th>{t('bil.numbers')}</th><th>{t('bil.calls')}</th><th>{t('bil.minutes')}</th><th>{t('bil.sms')}</th><th>{t('bil.leadsCol')}</th>
        </tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.company_id}>
            {(isSuper || isAgency) && <td>{r.agency_name}</td>}
            <td>{r.company_name}</td>
            <td>{num(r.numbers)}{r.premium ? ` (${num(r.premium)}★)` : ''}</td>
            <td>{num(r.calls)}</td><td>{num(r.minutes)}</td><td>{num(r.sms)}</td><td>{num(r.leads)}</td>
          </tr>
        ))}
          {rows.length > 0 && (
            <tr className="matrix-total">
              {(isSuper || isAgency) && <td></td>}
              <td><strong>{t('rep.grandTotal')}</strong></td>
              <td><strong>{num(totals.numbers)}</strong></td><td><strong>{num(totals.calls)}</strong></td>
              <td><strong>{num(totals.minutes)}</strong></td><td><strong>{num(totals.sms)}</strong></td><td><strong>{num(totals.leads)}</strong></td>
            </tr>
          )}
        </tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('bil.none')}</p>}
      </>)}
    </div>
  );
}
