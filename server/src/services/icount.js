// iCount API v3 client — billing via a hosted PayPage that creates a standing order
// (doctype "hk"). Every call is POST JSON to <apiUrl>/<module>/<method> with a Bearer token.
// Docs: https://apiv3.icount.co.il/
// No ICOUNT_TOKEN => mock mode: no network; callers get fake ids so the whole flow can be
// exercised locally (refused in production — see billingEnabled()).
const crypto = require('crypto');
const config = require('../config');
const { query } = require('../db/pool');

const isMock = () => !config.icount.token;
// billing is enforced when iCount is configured, or anywhere but production (mock testing)
const billingEnabled = () => !!config.icount.token || config.env !== 'production';

async function call(path, body = {}) {
  if (isMock()) throw Object.assign(new Error('iCount אינו מוגדר'), { reason: 'not_configured' });
  const r = await fetch(`${config.icount.apiUrl}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.icount.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`iCount ${path}: תשובה לא תקינה (HTTP ${r.status})`); }
  // iCount reports failures as status:false with a reason / error_description
  if (json.status === false || (!r.ok && !json.status)) {
    throw Object.assign(new Error(json.error_description || json.reason || `iCount ${path} נכשל`), { reason: json.reason, icount: json });
  }
  return json;
}

async function getSetting(k) {
  const r = await query('SELECT v FROM app_settings WHERE k = ?', [k]);
  return r[0] ? r[0].v : null;
}
async function setSetting(k, v) {
  await query('INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v)]);
}

// first value of a list-ish response (object keyed by id, or array)
const listOf = (x) => (Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.values(x) : []));

// iCount's internal id of ILS: currency/info {currency_code} -> {currency_id};
// fallback currency/get_list -> currencies_list keyed by currency code.
async function ilsCurrencyId() {
  try {
    const r = await call('currency/info', { currency_code: 'ILS' });
    if (r.currency_id != null && String(r.currency_code || 'ILS').toUpperCase() === 'ILS') return Number(r.currency_id);
  } catch (e) { /* try the list */ }
  const r = await call('currency/get_list', {});
  const list = r.currencies_list || {};
  const ils = list.ILS || list.ils || listOf(list).find((c) => String(c.currency_code || '').toUpperCase() === 'ILS');
  if (!ils || ils.currency_id == null) throw new Error('לא נמצא מטבע ILS ב-iCount — הגדר ICOUNT_PAYPAGE_ID ידנית');
  return Number(ils.currency_id);
}

// The one recurring-billing PayPage all subscriptions go through. Taken from
// ICOUNT_PAYPAGE_ID, else created once via the API and remembered in app_settings.
async function ensurePaypage() {
  if (config.icount.paypageId) return config.icount.paypageId;
  const saved = Number(await getSetting('icount_paypage_id')) || null;
  if (saved) return saved;
  const r = await call('paypage/create', {
    page_name: 'LeadClient - מנוי חודשי',
    page_name_en: 'LeadClient - Monthly subscription',
    header_text: 'הוראת קבע למנוי LeadClient',
    currency_id: await ilsCurrencyId(),
    items: [],                    // sale items are passed per customer in generate_sale
    doctype: 'hk',                // standing order
    hk_issue_every: 1,            // monthly
    hk_payments: 0,               // unlimited
    tax_exempt: false,
    require_phone: true,
    page_lang: 'he',
  });
  if (!r.paypage_id) throw new Error('יצירת דף התשלום ב-iCount נכשלה');
  await setSetting('icount_paypage_id', r.paypage_id);
  return Number(r.paypage_id);
}

// signature carried in the per-sale IPN URL, so a callback can be tied to its subscription
const ipnSig = (subId) => crypto.createHmac('sha256', config.jwt.secret).update(`icount-sub:${subId}`).digest('hex').slice(0, 32);
const ipnSigOk = (subId, sig) => {
  const a = Buffer.from(ipnSig(subId)), b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Start a standing-order sale for one subscription. Returns { sale_uniqid, sale_url }.
// The card is captured now; the first monthly debit happens on `startDate`.
// `returnTo` (e.g. "/pay/<token>") sends the customer back to that page with ?status=,
// otherwise back into the app with ?billing=.
async function generateSale({ subId, pkg, company, customer, startDate, returnTo }) {
  const base = config.publicUrl;
  const back = (s) => (returnTo ? `${base}${returnTo}?status=${s}` : `${base}/?billing=${s}&sub=${subId}`);
  if (isMock()) {
    return { sale_uniqid: `mock-${subId}`, sale_url: back('mock'), mock: true };
  }
  const paypageId = await ensurePaypage();
  const r = await call('paypage/generate_sale', {
    paypage_id: paypageId,
    items: [{ description: `מנוי LeadClient — ${pkg.name}`, unitprice_incl: Number(pkg.monthly_price), quantity: 1 }],
    client_name: company.name,
    first_name: customer.first_name || undefined,
    last_name: customer.last_name || undefined,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    hk_start_date: startDate,     // YYYY-MM-DD — first monthly debit
    hk_issue_every: 1,
    hk_payments: 0,
    page_lang: 'he',
    success_url: back('done'),
    failure_url: back('failed'),
    cancel_url: back('cancelled'),
    ipn_url: `${base}/api/public/icount/ipn?sub=${subId}&k=${ipnSig(subId)}`,
  });
  if (!r.sale_url) throw new Error('iCount לא החזיר קישור תשלום');
  return { sale_uniqid: r.sale_uniqid || null, sale_url: r.sale_url };
}

// recurring-billing profiles matching a filter ({client_id} or {email}), newest first
async function findHk(filter) {
  const r = await call('hk/get_list', { ...filter, show_all: true, list_type: 'array' });
  return listOf(r.hks_list).sort((a, b) => String(b.ts_created || '').localeCompare(String(a.ts_created || '')));
}
const findHkByEmail = (email) => findHk({ email });

// the customer's documents in iCount (invoices/receipts…), newest first
async function searchDocs(clientId, max = 20) {
  try {
    const r = await call('doc/search', { client_id: clientId, max_results: max, sort_order: 'DESC', detail_level: 1, get_doc_url: true });
    return listOf(r.results_list);
  } catch (e) {
    if (e.reason === 'no_results_found') return [];
    throw e;
  }
}

const hkInfo = (hkId, extra = {}) => call('hk/info', { hk_id: hkId, ...extra });
const hkCancel = (hkId) => call('hk/cancel', { hk_id: hkId });
const hkAddOneTimePayment = (hkId, sum, description) =>
  call('hk/add_one_time_payment', { hk_id: hkId, payment_sum: Number(sum), payment_description: description });

module.exports = {
  isMock, billingEnabled, call, ensurePaypage, generateSale, findHk, findHkByEmail, searchDocs,
  hkInfo, hkCancel, hkAddOneTimePayment, ipnSig, ipnSigOk, getSetting, setSetting,
};
