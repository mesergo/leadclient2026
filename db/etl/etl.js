// ETL: legacy mysqldump -> clean schema seed.sql. Preserves legacy IDs as PKs.
const fs = require('fs');
const path = require('path');
const { loadTable } = require('./parse-dump');

const DUMP = process.argv[2] || path.resolve(__dirname, '../../../2026cloud/leadclie_devdb.sql');
const OUT = path.resolve(__dirname, '../seed.sql');
const sql = fs.readFileSync(DUMP, 'utf8');

const BSLASH = String.fromCharCode(92);
const SQUOTE = String.fromCharCode(39);

// ---- value transformers ----
const ts = (v) => {
  if (v === null || v === undefined || v === '' || v === '0') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString().slice(0, 19).replace('T', ' ');
};
const bool = (v) => (v === '1' || v === 1 ? 1 : 0);
const num = (v) => (v === null || v === '' ? null : v);
const notBanned = (v) => (v === '1' || v === 1 ? 0 : 1); // banned=1 -> is_active 0
const ivr = (v) => {
  const s = String(v || '').toLowerCase();
  return ['native', 'micropay', 'paycall', 'maskyoo', 'all'].includes(s) ? s : 'native';
};
const roleFromGroup = (g) => {
  const map = { '1': 'super_admin', '2': 'agency_admin', '3': 'company_admin', '4': 'company_user', '5': 'translator' };
  return map[String(g)] || 'company_user';
};
const uuid = (seed) => '00000000-0000-4000-8000-' + String(seed).padStart(12, '0').slice(-12);

// ---- SQL escaping (charCode-safe) ----
function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  let s = String(v);
  s = s.split(BSLASH).join(BSLASH + BSLASH);
  s = s.split(SQUOTE).join(SQUOTE + SQUOTE);
  return SQUOTE + s + SQUOTE;
}

const C = (leg) => (row) => (row[leg] === undefined ? null : row[leg]);

const TABLES = [
  {
    target: 'agencies', source: 'agencies',
    map: {
      id: C('id'), name: C('name'), logo_url: C('logo'), main_company_id: C('main_company'),
      ivr_provider: (r) => ivr(r.use_ivr), phone_limit: (r) => num(r.phone_limit),
      icount_cid: C('icount_cid'), icount_user: C('icount_user'), icount_pass: C('icount_pass'),
      allow_add_user_external: (r) => bool(r.alow_add_user_external), control_templates: (r) => bool(r.controlTemplates),
      whatsapp_id: C('whatsappId'), is_active: (r) => notBanned(r.banned), suspended_at: (r) => ts(r.banned_time),
      created_at: (r) => ts(r.register_date) || '2020-01-01 00:00:00', legacy_id: C('id'),
    },
  },
  {
    target: 'companies', source: 'companies',
    map: {
      id: C('id'), agency_id: C('agency'), name: C('name'), logo_url: C('logo'),
      phone: C('phone'), fax: C('fax'), address: C('address'), zip_code: C('zip_code'), industry: C('industry'),
      public_token: (r) => uuid(r.id),
      returning_sms_from: C('returning_sms_from'), returning_sms_text: C('returning_sms_text'),
      leads_distribution_enabled: (r) => bool(r.leads_distribution_enabled),
      mesergo_enabled: (r) => bool(r.active_mesergo_connect), mesergo_username: C('mesergo_username'),
      mesergo_token: C('mesergo_token'), mesergo_sender_id: C('mesergo_senderID'),
      whatsapp_app_id: C('wa_app_id'), whatsapp_token: C('wa_token'), whatsapp_number: C('wa_number'),
      smoove_token: C('smoove_token'), smoove_by_status: (r) => bool(r.smoove_by_status), smoove_by_parameter: C('smoove_by_parameter'),
      default_phone_redirect: C('default_phone_redirect'), default_phone_redirect_close: C('default_phone_redirect_closeHours'),
      contacts_access: (r) => bool(r.contacts_access), is_donation_center: (r) => bool(r.is_donations),
      payment_package: C('payment_package'), payment_agent: (r) => num(r.payment_agent),
      phone_limit: (r) => num(r.phone_limit), expiration_date: (r) => ts(r.expiration_date),
      is_active: (r) => notBanned(r.banned), suspended_at: (r) => ts(r.banned_time),
      created_at: (r) => ts(r.register_date) || '2020-01-01 00:00:00', legacy_id: C('id'),
    },
  },
  {
    target: 'services', source: 'services',
    map: {
      id: C('id'), company_id: C('company'), name: C('name'), description: C('description'),
      service_type: C('service_type'), public_hash: (r) => r.unique_hash || uuid('s' + r.id),
      phone_service_number: C('phone_service_number'), site_url: C('site_url'),
      is_import_service: (r) => bool(r.is_import_service), is_whatsapp_service: (r) => bool(r.is_whatsapp_service),
      distribute_leads: C('distribute_leads'), returning_sms_from: C('returning_sms_from'), returning_sms_text: C('returning_sms_text'),
      open_hours: C('openHours'), close_hours_phone: C('close_hours_phone'),
      created_at: (r) => ts(r.register_date) || '2020-01-01 00:00:00', legacy_id: C('id'),
    },
  },
  {
    target: 'users', source: 'users',
    map: {
      id: C('id'), company_id: C('company'), role: (r) => roleFromGroup(r.group),
      username: (r) => r.user || ('user' + r.id), email: C('email'),
      first_name: C('first_name'), last_name: C('last_name'), display_name: C('display_name'),
      phone: C('phone'), password_hash: C('password'), google_id: C('google_id'),
      language: (r) => r.language || 'he', contacts_access: (r) => bool(r.contacts_access),
      current_status: C('currrentStauts'), last_seen_at: (r) => ts(r.last_seen),
      is_active: (r) => notBanned(r.banned), suspended_at: (r) => ts(r.banned_time),
      created_at: (r) => ts(r.register_date) || '2020-01-01 00:00:00', legacy_id: C('id'),
    },
  },
  {
    target: 'lead_statuses', source: 'statuses',
    map: {
      id: C('id'), company_id: C('company'), text: C('text'), color: C('color'),
      sort_order: (r) => num(r.status_order) || 0, is_static: (r) => bool(r.is_static),
      is_waiting: (r) => bool(r.is_waiting), is_finished: (r) => bool(r.is_finished),
      for_notification: (r) => bool(r.is_for_notificition), legacy_id: C('id'),
    },
  },
  {
    target: 'tags', source: 'company_lead_tags',
    map: { id: C('id'), company_id: C('company_id'), label: C('label'), is_hidden: (r) => bool(r.is_hidden), legacy_id: C('id') },
  },
  {
    target: 'lead_tags', source: 'tags_for_leads',
    map: { lead_id: C('lead_id'), tag_id: C('tag_id') },
  },
  {
    target: 'contacts', source: 'contacts',
    map: {
      id: C('id'), company_id: C('company'), first_name: C('first_name'), last_name: C('last_name'),
      phone: C('phone'), phone2: C('phone2'), email: C('email'), info: C('info'), status: (r) => num(r.status),
      img: C('img'), created_at: (r) => ts(r.date_created) || '2020-01-01 00:00:00', legacy_id: C('id'),
    },
  },
  {
    target: 'leads', source: 'leads',
    map: {
      id: C('id'), company_id: C('company_id'), service_id: (r) => num(r.service_id), status_id: (r) => num(r.status_id),
      current_agent_id: (r) => num(r.current_agent), lead_name: C('lead_name'), lead_phone: C('lead_phone'),
      lead_email: C('lead_email'), lead_info: C('lead_info'), lead_rating: (r) => num(r.lead_rating),
      lead_through: C('lead_through'), is_converted: (r) => bool(r.is_converted), new_messages: (r) => bool(r.new_messages),
      facebook_id: C('facebook_id'), referrer: C('referrer'), ip_address: C('ip_address'),
      browser_name: C('browser_name'), platform: C('platform'),
      last_interaction_at: (r) => ts(r.last_interaction), last_interaction_type: C('last_interaction_type'),
      created_at: (r) => ts(r.date) || '2020-01-01 00:00:00', updated_at: (r) => ts(r.last_update) || ts(r.date) || '2020-01-01 00:00:00',
      legacy_id: C('id'),
    },
  },
  {
    target: 'lead_conversations', source: 'lead_conversations',
    map: {
      id: C('id'), lead_id: C('lead_id'), user_id: (r) => num(r.user_id), content: C('content'),
      send_by: C('sendBy'), comment: C('comment'), from_me: (r) => bool(r.from_me), unread: (r) => bool(r.unread),
      created_at: (r) => ts(r.date) || '2020-01-01 00:00:00',
    },
  },
  {
    target: 'reminders', source: 'reminders',
    map: { id: C('id'), lead_id: C('lead_id'), user_id: (r) => num(r.user_id), lead_name: C('lead_name'), reminder_at: (r) => ts(r.reminder_date) || '2020-01-01 00:00:00', comment: C('reminder_comment') },
  },
  {
    target: 'phone_numbers', source: 'all_phones',
    map: {
      company_id: (r) => num(r.company_id), service_id: (r) => num(r.service_id), ivr_provider: () => 'native',
      phone_number: C('phone_number'), number_to_display: C('number_to_display'), redirect_to_number: C('redirect_to_number'),
      is_premium: (r) => bool(r.is_premium), open_hours: C('openHours'), close_hours_phone: C('close_hours_phone'),
      is_visible: (r) => (r.show === '0' ? 0 : 1), legacy_id: C('number_id'),
    },
  },
  {
    target: 'phone_numbers', source: 'maskyoo_phones',
    map: {
      company_id: (r) => num(r.company_id), service_id: (r) => num(r.service_id), ivr_provider: () => 'maskyoo',
      phone_number: C('phone_number'), redirect_to_number: C('redirect_to_number'), is_premium: (r) => bool(r.is_premium),
      open_hours: C('openHours'), close_hours_phone: C('close_hours_phone'),
    },
  },
  {
    target: 'phone_numbers', source: 'micropay_phones',
    map: { company_id: (r) => num(r.company_id), service_id: (r) => num(r.service_id), ivr_provider: () => 'micropay', phone_number: C('phone_number'), redirect_to_number: C('redirect_to_number'), is_premium: (r) => bool(r.is_premium) },
  },
  {
    target: 'phone_numbers', source: 'paycall_phones',
    map: { company_id: (r) => num(r.company_id), service_id: (r) => num(r.service_id), ivr_provider: () => 'paycall', phone_number: C('phone_number'), redirect_to_number: C('redirect_to_number'), is_premium: (r) => bool(r.is_premium) },
  },
  {
    target: 'message_templates', source: 'messages',
    map: {
      id: C('id'), agency_id: (r) => num(r.agencyId), name: C('name'), type: C('type'), category: C('category'),
      language: C('language'), namespace: C('namespace'), header: C('header'), body: C('body'), footer: C('footer'),
      buttons: C('buttons'), parameters: C('parameters'), is_template: (r) => bool(r.is_template),
      for_whatsapp: (r) => bool(r.isForWhatsapp), for_sms: (r) => bool(r.isForSms), legacy_id: C('id'),
    },
  },
  {
    target: 'invitations', source: 'invitations',
    map: { id: C('id'), user_id: C('user_id'), company_id: (r) => num(r.company), inviting_user_id: (r) => num(r.inviting_user), sent_at: (r) => ts(r.date_of_send), connected_at: (r) => ts(r.date_of_connect), closed: (r) => bool(r.closed_invitation), last_reminder_at: (r) => ts(r.last_reminder) },
  },
  {
    target: 'user_restrictions', source: 'user_restrictions',
    map: { user_id: C('user_id'), login_hours: C('login_hours'), login_source: C('login_source') },
  },
  {
    target: 'special_redirects', source: 'special_redirects',
    map: { id: C('id'), virtual_number: C('virtual'), caller_number: C('caller'), redirect_to: C('redirect_to') },
  },
  {
    target: 'monthly_reports', source: 'monthly_reports',
    map: { id: C('id'), company_id: C('company'), month: (r) => num(r.month), year: (r) => num(r.year), google_csv: C('google_csv'), google_keywords_csv: C('google_keywords_csv'), facebook_csv: C('facebook_csv'), comment: C('comment') },
  },
  {
    target: 'languages', source: 'languages',
    map: { slug: C('slug'), language: C('language'), language_english: C('language_english'), dir: (r) => r.dir || 'ltr', is_rtl: (r) => bool(r.isRTL), is_active: () => 1 },
  },
  {
    target: 'payment_packages', source: 'payment_packages',
    map: { id: C('id'), price: (r) => num(r.price) || 0, users: (r) => num(r.users), additional_user_price: (r) => num(r.additional_user_price), phones: (r) => num(r.phones), additional_phone_price: (r) => num(r.additional_phone_price), call_minutes: (r) => num(r.call_minutes), additional_minute_price: (r) => num(r.additional_minute_price), unlimited_minutes_price: (r) => num(r.unlimited_minutes_price), leads: (r) => num(r.leads), additional_lead_price: (r) => num(r.additional_lead_price), unlimited_leads_price: (r) => num(r.unlimited_leads_price) },
  },
  {
    target: 'plans', source: 'plans',
    map: { id: C('id'), pay_per_month: (r) => num(r.pay_per_month), pay_minute_home: (r) => num(r.pay_minute_home), pay_minute_mobile: (r) => num(r.pay_minute_mobile), fix_price: (r) => num(r.fix_price), include_minute: (r) => num(r.include_minute), line_plan: (r) => num(r.line_plan) },
  },
  {
    target: 'billing_defaults', source: 'billing_defaults',
    map: { id: () => 1, currency: C('currency'), currency_sign: C('currency_sign'), agency_price: (r) => num(r.agency), company_price: (r) => num(r.company), user_price: (r) => num(r.user), sms_price: (r) => num(r.sms), premium_virtual_phone: (r) => num(r.premium_virtual_phone), regular_virtual_phone: (r) => num(r.regular_virtual_phone), virtual_phone_minute: (r) => num(r.virtual_phone_minute), tax_percent: (r) => num(r.tax_percent) },
  },
  {
    target: 'bills', source: 'bills',
    map: { id: C('id'), company_id: (r) => num(r.company_id), agency_id: (r) => num(r.agency_id), type: C('type'), billing_month: C('month'), bill_date: (r) => ts(r.bill_date), bill_data: C('bill_data') },
  },
  {
    target: 'payments', source: 'payments',
    map: { id: C('id'), company_id: (r) => num(r.leadclient_id), payment_method: C('payment_method'), icount_token_cc: C('icount_token_cc') },
  },
  {
    target: 'package_history', source: 'packages_log',
    map: { id: C('id'), company_id: C('company_id'), package_id: C('package_id'), start_at: (r) => ts(r.start), end_at: (r) => ts(r.end), details: C('package_details') },
  },
  {
    target: 'contact_conversations', source: 'contact_conversations',
    map: { id: C('id'), contact_id: C('contact_id'), user_id: (r) => num(r.user_id), content: C('content'), send_by: C('sendBy'), comment: C('comment'), from_me: (r) => bool(r.from_me), unread: (r) => bool(r.unread), created_at: (r) => ts(r.date) || '2020-01-01 00:00:00' },
  },
  {
    target: 'contact_tags', source: 'contacts_tags',
    map: { contact_id: C('contact'), tag_id: C('tag') },
  },
  {
    target: 'action_log', source: 'action_log',
    map: { id: C('id'), agency_id: (r) => num(r.agency), company_id: (r) => num(r.company), service_id: (r) => num(r.service), lead_id: (r) => num(r.lead), user_id: (r) => num(r.user_id), user_name: C('user'), content: C('content'), icon: C('icon'), json_vars: C('json_vars'), created_at: (r) => ts(r.date) || '2020-01-01 00:00:00' },
  },
];

// ---- PASS A: transform all sources into memory (dataset[target] = [{col:val}]) ----
const dataset = {};
const colOrder = {};
for (const cfg of TABLES) {
  const rows = loadTable(sql, cfg.source);
  const cols = Object.keys(cfg.map);
  colOrder[cfg.target] = cols;
  const mapped = rows.map((r) => {
    const o = {};
    for (const c of cols) o[c] = cfg.map[c](r);
    return o;
  });
  dataset[cfg.target] = (dataset[cfg.target] || []).concat(mapped);
}

// single-row config table: keep only first
if (dataset.billing_defaults) dataset.billing_defaults = dataset.billing_defaults.slice(0, 1);

// ensure unique usernames (legacy `user` had duplicates: HTML-encoded emails, google signups)
const seenUser = new Set();
for (const u of dataset.users || []) {
  let name = (u.username || 'user' + u.id).replace(/&#64;/g, '@');
  const key = name.toLowerCase();
  if (seenUser.has(key)) name = name + '_' + u.id;
  seenUser.add(name.toLowerCase());
  u.username = name;
}

// ---- PASS B: clean referential integrity (order matters: parents cleaned first) ----
const idSet = (t, key = 'id') => new Set((dataset[t] || []).map((r) => String(r[key])));
const clean = []; // log
// [child, col, parent, action] — action: 'null' (set NULL) or 'drop' (remove row)
const RULES = [
  ['lead_statuses', 'company_id', 'companies', 'drop'],
  ['tags', 'company_id', 'companies', 'drop'],
  ['contacts', 'company_id', 'companies', 'drop'],
  ['services', 'company_id', 'companies', 'drop'],
  ['companies', 'agency_id', 'agencies', 'null'],
  ['users', 'company_id', 'companies', 'null'],
  ['message_templates', 'agency_id', 'agencies', 'null'],
  ['leads', 'company_id', 'companies', 'drop'],
  ['leads', 'service_id', 'services', 'null'],
  ['leads', 'status_id', 'lead_statuses', 'null'],
  ['leads', 'current_agent_id', 'users', 'null'],
  ['lead_conversations', 'lead_id', 'leads', 'drop'],
  ['reminders', 'lead_id', 'leads', 'drop'],
  ['lead_tags', 'lead_id', 'leads', 'drop'],
  ['lead_tags', 'tag_id', 'tags', 'drop'],
  ['contact_conversations', 'contact_id', 'contacts', 'drop'],
  ['contact_tags', 'contact_id', 'contacts', 'drop'],
  ['contact_tags', 'tag_id', 'tags', 'drop'],
  ['invitations', 'user_id', 'users', 'drop'],
  ['user_restrictions', 'user_id', 'users', 'drop'],
  ['package_history', 'company_id', 'companies', 'drop'],
  ['monthly_reports', 'company_id', 'companies', 'drop'],
];
for (const [child, col, parent, action] of RULES) {
  const rows = dataset[child];
  if (!rows || !rows.length) continue;
  const pIds = idSet(parent);
  const isOrphan = (v) => v !== null && v !== undefined && v !== '' && !pIds.has(String(v));
  if (action === 'null') {
    let n = 0;
    for (const r of rows) if (isOrphan(r[col])) { r[col] = null; n++; }
    if (n) clean.push(`nulled ${n} ${child}.${col} (orphan -> ${parent})`);
  } else {
    const before = rows.length;
    dataset[child] = rows.filter((r) => !isOrphan(r[col]));
    const dropped = before - dataset[child].length;
    if (dropped) clean.push(`dropped ${dropped} ${child} rows (orphan ${col} -> ${parent})`);
  }
}

// ---- PASS C: emit ----
const out = [];
out.push('-- Auto-generated seed from legacy dump. Do not edit by hand.');
out.push('SET NAMES utf8mb4;');
out.push('SET FOREIGN_KEY_CHECKS = 0;');
const summary = [];
const emitted = new Set();
for (const cfg of TABLES) {
  if (emitted.has(cfg.target)) continue;
  emitted.add(cfg.target);
  const rows = dataset[cfg.target] || [];
  const cols = colOrder[cfg.target];
  if (!rows.length) { summary.push(`${cfg.target}: 0`); continue; }
  const values = rows.map((r) => '(' + cols.map((c) => esc(r[c])).join(',') + ')');
  const CHUNK = 200;
  for (let i = 0; i < values.length; i += CHUNK) {
    out.push(`INSERT INTO ${cfg.target} (${cols.join(', ')}) VALUES\n${values.slice(i, i + CHUNK).join(',\n')};`);
  }
  summary.push(`${cfg.target}: ${rows.length}`);
}
out.push('SET FOREIGN_KEY_CHECKS = 1;');
fs.writeFileSync(OUT, out.join('\n') + '\n');
console.log('Wrote', OUT);
console.log(summary.join('\n'));
console.log('\n-- cleaning --');
console.log(clean.length ? clean.join('\n') : 'nothing to clean');
