-- ETL: app_leadclient_net (legacy prod) -> leadclient (new schema). Preserves ids.
SET FOREIGN_KEY_CHECKS = 0;
SET SESSION sql_mode = '';
SET @L = 'app_leadclient_net';

-- clear existing (dev) data in dependency order
DELETE FROM leadclient.action_log; DELETE FROM leadclient.notifications;
DELETE FROM leadclient.lead_conversations; DELETE FROM leadclient.reminders; DELETE FROM leadclient.lead_tags;
DELETE FROM leadclient.contact_conversations; DELETE FROM leadclient.contact_tags;
DELETE FROM leadclient.leads; DELETE FROM leadclient.contacts; DELETE FROM leadclient.tags;
DELETE FROM leadclient.lead_statuses; DELETE FROM leadclient.phone_numbers; DELETE FROM leadclient.services;
DELETE FROM leadclient.message_templates; DELETE FROM leadclient.invitations; DELETE FROM leadclient.user_restrictions;
DELETE FROM leadclient.users; DELETE FROM leadclient.companies; DELETE FROM leadclient.agencies;

-- agencies
INSERT INTO leadclient.agencies
  (id, name, logo_url, main_company_id, ivr_provider, phone_limit, icount_cid, icount_user, icount_pass,
   allow_add_user_external, control_templates, whatsapp_id, is_active, suspended_at, created_at, legacy_id)
SELECT id, name, NULLIF(logo,''), NULLIF(main_company,0),
  CASE LOWER(use_ivr) WHEN 'micropay' THEN 'micropay' WHEN 'paycall' THEN 'paycall'
       WHEN 'maskyoo' THEN 'maskyoo' WHEN 'all' THEN 'all' ELSE 'native' END,
  NULLIF(phone_limit,0), NULLIF(icount_cid,''), NULLIF(icount_user,''), NULLIF(icount_pass,''),
  IF(alow_add_user_external>=1,1,0), IF(controlTemplates=1,1,0), NULLIF(whatsappId,''),
  IF(banned>0,0,1), IF(banned_time>0, FROM_UNIXTIME(banned_time), NULL),
  IFNULL(FROM_UNIXTIME(NULLIF(register_date,0)), '2020-01-01 00:00:00'), id
FROM app_leadclient_net.agencies;

-- companies
INSERT INTO leadclient.companies
  (id, agency_id, name, logo_url, phone, fax, address, zip_code, industry, public_token,
   returning_sms_from, returning_sms_text, leads_distribution_enabled,
   mesergo_enabled, mesergo_username, mesergo_token, mesergo_sender_id,
   whatsapp_app_id, whatsapp_token, whatsapp_number, smoove_token, smoove_by_status, smoove_by_parameter,
   default_phone_redirect, default_phone_redirect_close, contacts_access, is_donation_center,
   payment_package, payment_agent, phone_limit, expiration_date, is_active, suspended_at, created_at, legacy_id)
SELECT c.id, NULLIF(c.agency,0), c.name, NULLIF(c.logo,''), NULLIF(c.phone,''), NULLIF(c.fax,''),
  NULLIF(c.address,''), NULLIF(c.zip_code,''), NULLIF(c.industry,''),
  COALESCE(NULLIF(c.company_hash,''), UUID()),
  NULLIF(c.returning_sms_from,''), NULLIF(c.returning_sms_text,''), IF(c.leads_distribution_enabled=1,1,0),
  IF(c.active_mesergo_connect=1,1,0), NULLIF(c.mesergo_username,''), NULLIF(c.mesergo_token,''), NULLIF(c.mesergo_senderID,''),
  NULLIF(c.wa_app_id,''), NULLIF(c.wa_token,''), NULLIF(c.wa_number,''),
  NULLIF(c.smoove_token,''), IF(c.smoove_by_status=1,1,0), NULLIF(c.smoove_by_parameter,''),
  NULLIF(c.default_phone_redirect,''), NULLIF(c.default_phone_redirect_closeHours,''),
  IF(c.contacts_access>=1,1,0), IF(c.is_donations>=1,1,0),
  NULLIF(c.payment_package,''), NULLIF(c.payment_agent,0), NULLIF(c.phone_limit,0),
  IF(c.expiration_date>0, FROM_UNIXTIME(c.expiration_date), NULL),
  IF(c.banned>0,0,1), IF(c.banned_time>0, FROM_UNIXTIME(c.banned_time), NULL),
  IFNULL(FROM_UNIXTIME(NULLIF(c.register_date,0)), '2020-01-01 00:00:00'), c.id
FROM app_leadclient_net.companies c
WHERE c.agency IS NULL OR c.agency = 0 OR c.agency IN (SELECT id FROM leadclient.agencies);

-- users (dedup usernames via ROW_NUMBER)
INSERT INTO leadclient.users
  (id, company_id, role, username, email, first_name, last_name, display_name, phone, password_hash,
   google_id, language, contacts_access, current_status, last_seen_at, is_active, suspended_at, created_at, legacy_id)
SELECT u.id, NULLIF(u.company,0),
  CASE u.`group` WHEN 1 THEN 'super_admin' WHEN 2 THEN 'agency_admin' WHEN 3 THEN 'company_admin'
       WHEN 4 THEN 'company_user' WHEN 5 THEN 'translator' ELSE 'company_user' END,
  IF(u.rn > 1, CONCAT(u.uname, '_', u.id), u.uname),
  NULLIF(u.email,''), NULLIF(u.first_name,''), NULLIF(u.last_name,''),
  COALESCE(NULLIF(u.display_name,''), u.uname), NULLIF(u.phone,''), NULLIF(u.password,''),
  NULLIF(u.google_id,''), COALESCE(NULLIF(u.language,''),'he'), IF(u.contacts_access>=1,1,0),
  NULLIF(u.currrentStauts,''), IF(u.last_seen>0, FROM_UNIXTIME(u.last_seen), NULL),
  IF(u.banned>0,0,1), IF(u.banned_time>0, FROM_UNIXTIME(u.banned_time), NULL),
  IFNULL(FROM_UNIXTIME(NULLIF(u.register_date,0)), '2020-01-01 00:00:00'), u.id
FROM (
  SELECT x.*, REPLACE(COALESCE(NULLIF(x.user,''), CONCAT('user', x.id)), '&#64;', '@') AS uname,
    ROW_NUMBER() OVER (PARTITION BY LOWER(REPLACE(COALESCE(NULLIF(x.user,''), CONCAT('user', x.id)), '&#64;', '@')) ORDER BY x.id) AS rn
  FROM app_leadclient_net.users x
) u
WHERE u.company IS NULL OR u.company = 0 OR u.company IN (SELECT id FROM leadclient.companies);

-- services (channels)
INSERT INTO leadclient.services
  (id, company_id, name, description, service_type, public_hash, phone_service_number, site_url,
   is_import_service, is_whatsapp_service, distribute_leads, returning_sms_from, returning_sms_text,
   open_hours, close_hours_phone, created_at, legacy_id)
SELECT s.id, s.company, s.name, NULLIF(s.description,''), NULLIF(s.service_type,''),
  COALESCE(NULLIF(s.unique_hash,''), UUID()), NULLIF(s.phone_service_number,''), NULLIF(s.site_url,''),
  IF(s.is_import_service=1,1,0), IF(s.is_whatsapp_service=1,1,0), NULLIF(s.distribute_leads,''),
  NULLIF(s.returning_sms_from,''), NULLIF(s.returning_sms_text,''), NULLIF(s.openHours,''), NULLIF(s.close_hours_phone,''),
  IFNULL(FROM_UNIXTIME(NULLIF(s.register_date,0)), '2020-01-01 00:00:00'), s.id
FROM app_leadclient_net.services s
WHERE s.company IN (SELECT id FROM leadclient.companies);

-- lead_statuses
INSERT INTO leadclient.lead_statuses
  (id, company_id, text, color, sort_order, is_static, is_waiting, is_finished, for_notification, legacy_id)
SELECT st.id, st.company, st.text, NULLIF(st.color,''), IFNULL(st.status_order,0),
  IF(st.is_static=1,1,0), IF(st.is_waiting=1,1,0), IF(st.is_finished=1,1,0), IF(st.is_for_notificition=1,1,0), st.id
FROM app_leadclient_net.statuses st
WHERE st.company IN (SELECT id FROM leadclient.companies);

-- tags (from company_lead_tags)
INSERT INTO leadclient.tags (id, company_id, label, is_hidden, legacy_id)
SELECT t.id, t.company_id, t.label, IF(t.is_hidden=1,1,0), t.id
FROM app_leadclient_net.company_lead_tags t
WHERE t.company_id IN (SELECT id FROM leadclient.companies);

-- contacts
INSERT INTO leadclient.contacts
  (id, company_id, first_name, last_name, phone, phone2, email, info, status, img, is_active, created_at, legacy_id)
SELECT ct.id, ct.company, NULLIF(ct.first_name,''), NULLIF(ct.last_name,''), NULLIF(ct.phone,''),
  NULLIF(ct.phone2,''), NULLIF(ct.email,''), NULLIF(ct.info,''), NULLIF(ct.status,0), NULLIF(ct.img,''),
  1, IFNULL(FROM_UNIXTIME(NULLIF(ct.date_created,0)), '2020-01-01 00:00:00'), ct.id
FROM app_leadclient_net.contacts ct
WHERE ct.company IN (SELECT id FROM leadclient.companies);

-- leads (large). company_id filtered; nullable FKs nulled if orphan.
INSERT INTO leadclient.leads
  (id, company_id, service_id, status_id, current_agent_id, lead_name, lead_phone, lead_email, lead_info,
   lead_rating, lead_through, is_converted, new_messages, facebook_id, referrer, ip_address, browser_name,
   platform, last_interaction_at, last_interaction_type, created_at, updated_at, legacy_id)
SELECT l.id, l.company_id,
  (SELECT id FROM leadclient.services WHERE id = l.service_id),
  (SELECT id FROM leadclient.lead_statuses WHERE id = l.status_id),
  (SELECT id FROM leadclient.users WHERE id = l.current_agent),
  NULLIF(l.lead_name,''), NULLIF(l.lead_phone,''), NULLIF(l.lead_email,''), NULLIF(l.lead_info,''),
  NULLIF(l.lead_rating,0), NULLIF(l.lead_through,''), IF(l.is_converted=1,1,0), IF(l.new_messages=1,1,0),
  NULLIF(l.facebook_id,''), NULLIF(l.referrer,''), NULLIF(l.ip_address,''), NULLIF(l.browser_name,''),
  NULLIF(l.platform,''), IF(l.last_interaction>0, FROM_UNIXTIME(l.last_interaction), NULL), NULLIF(l.last_interaction_type,''),
  IFNULL(FROM_UNIXTIME(NULLIF(l.date,0)), '2020-01-01 00:00:00'),
  IFNULL(FROM_UNIXTIME(NULLIF(l.last_update,0)), IFNULL(FROM_UNIXTIME(NULLIF(l.date,0)),'2020-01-01 00:00:00')), l.id
FROM app_leadclient_net.leads l
WHERE l.company_id IN (SELECT id FROM leadclient.companies);

-- lead_tags
INSERT INTO leadclient.lead_tags (lead_id, tag_id)
SELECT lt.lead_id, lt.tag_id FROM app_leadclient_net.tags_for_leads lt
WHERE lt.lead_id IN (SELECT id FROM leadclient.leads) AND lt.tag_id IN (SELECT id FROM leadclient.tags);

-- reminders
INSERT INTO leadclient.reminders (id, lead_id, user_id, lead_name, reminder_at, comment)
SELECT r.id, r.lead_id, NULLIF(r.user_id,0), NULLIF(r.lead_name,''),
  IFNULL(FROM_UNIXTIME(NULLIF(r.reminder_date,0)),'2020-01-01 00:00:00'), NULLIF(r.reminder_comment,'')
FROM app_leadclient_net.reminders r WHERE r.lead_id IN (SELECT id FROM leadclient.leads);

-- phone_numbers (unified across IVR providers)
INSERT INTO leadclient.phone_numbers (company_id, service_id, ivr_provider, phone_number, number_to_display, redirect_to_number, is_premium, open_hours, close_hours_phone, is_visible)
SELECT NULLIF(company_id,0), (SELECT id FROM leadclient.services WHERE id = p.service_id), 'native',
  phone_number, NULLIF(number_to_display,''), NULLIF(redirect_to_number,''), IF(is_premium='1',1,0), NULLIF(openHours,''), NULLIF(close_hours_phone,''), IF(`show`='0',0,1)
FROM app_leadclient_net.all_phones p WHERE company_id IN (SELECT id FROM leadclient.companies);
INSERT INTO leadclient.phone_numbers (company_id, service_id, ivr_provider, phone_number, redirect_to_number, is_premium)
SELECT NULLIF(company_id,0), (SELECT id FROM leadclient.services WHERE id = m.service_id), 'maskyoo', phone_number, NULLIF(redirect_to_number,''), IF(is_premium='1',1,0)
FROM app_leadclient_net.maskyoo_phones m WHERE company_id IN (SELECT id FROM leadclient.companies);

-- message templates
INSERT INTO leadclient.message_templates (id, agency_id, name, type, body, is_template, for_whatsapp, for_sms, legacy_id)
SELECT id, (SELECT id FROM leadclient.agencies WHERE id = mg.agencyId), name, NULLIF(type,''), NULLIF(body,''), IF(is_template=1,1,0), IF(isForWhatsapp=1,1,0), IF(isForSms=1,1,0), id
FROM app_leadclient_net.messages mg;

-- languages
INSERT INTO leadclient.languages (slug, language, language_english, dir, is_rtl, is_active)
SELECT slug, language, NULLIF(language_english,''), IFNULL(NULLIF(dir,''),'ltr'), IF(isRTL=1,1,0), 1
FROM app_leadclient_net.languages;

-- payment packages + billing defaults
INSERT INTO leadclient.payment_packages (id, price, users, additional_user_price, phones, additional_phone_price, call_minutes, additional_minute_price, unlimited_minutes_price, leads, additional_lead_price, unlimited_leads_price)
SELECT id, IFNULL(price,0), users, additional_user_price, phones, additional_phone_price, call_minutes, additional_minute_price, unlimited_minutes_price, leads, additional_lead_price, unlimited_leads_price
FROM app_leadclient_net.payment_packages;

-- action_log (recent 3000 for dashboard feed)
INSERT INTO leadclient.action_log (id, agency_id, company_id, service_id, lead_id, user_id, user_name, content, icon, created_at)
SELECT id, NULLIF(agency,0), NULLIF(company,0), NULLIF(service,0), NULLIF(lead,0), NULLIF(user_id,0), NULLIF(user,''), NULLIF(content,''), NULLIF(icon,''),
  IFNULL(FROM_UNIXTIME(NULLIF(date,0)),'2020-01-01 00:00:00')
FROM app_leadclient_net.action_log ORDER BY id DESC LIMIT 3000;

SET FOREIGN_KEY_CHECKS = 1;
SELECT 'ETL DONE' AS status;
