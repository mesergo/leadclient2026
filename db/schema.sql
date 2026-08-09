-- ============================================================
-- LeadClient — MySQL/MariaDB schema (fresh, faithful to legacy)
-- Engine: InnoDB · Charset: utf8mb4
-- Multi-tenant isolation enforced at APP level (see docs/ARCHITECTURE.md)
-- Dates: DATETIME (legacy stored Unix int; converted in ETL)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- 1. Tenancy ----------

CREATE TABLE IF NOT EXISTS agencies (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name                  VARCHAR(100) NOT NULL,
  logo_url              VARCHAR(500) NULL,
  main_company_id       BIGINT UNSIGNED NULL,
  ivr_provider          ENUM('native','micropay','paycall','maskyoo','all') NOT NULL DEFAULT 'native',
  phone_limit           INT NULL,
  -- iCount billing integration (values stored; no live call in this build)
  icount_cid            VARCHAR(100) NULL,
  icount_user           VARCHAR(100) NULL,
  icount_pass           VARCHAR(255) NULL,
  allow_add_user_external TINYINT(1) NOT NULL DEFAULT 0,
  control_templates     TINYINT(1) NOT NULL DEFAULT 0,
  whatsapp_id           VARCHAR(50) NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  suspended_at          DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_id             BIGINT UNSIGNED NULL,
  INDEX idx_agencies_active (is_active),
  UNIQUE KEY uq_agencies_legacy (legacy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS companies (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  agency_id             BIGINT UNSIGNED NULL,
  name                  VARCHAR(150) NOT NULL,
  logo_url              VARCHAR(500) NULL,
  phone                 VARCHAR(30) NULL,
  fax                   VARCHAR(30) NULL,
  address               VARCHAR(150) NULL,
  zip_code              VARCHAR(20) NULL,
  industry              VARCHAR(50) NULL,
  public_token          CHAR(36) NOT NULL,
  -- returning SMS to lead
  returning_sms_enabled TINYINT(1) NOT NULL DEFAULT 0,
  returning_sms_from    VARCHAR(20) NULL,
  returning_sms_text    VARCHAR(500) NULL,
  -- leads distribution
  leads_distribution_enabled TINYINT(1) NOT NULL DEFAULT 0,
  -- integrations (stored only)
  mesergo_enabled       TINYINT(1) NOT NULL DEFAULT 0,
  mesergo_username      VARCHAR(100) NULL,
  mesergo_token         VARCHAR(255) NULL,
  mesergo_sender_id     VARCHAR(20) NULL,
  whatsapp_enabled      TINYINT(1) NOT NULL DEFAULT 0,
  whatsapp_app_id       VARCHAR(100) NULL,
  whatsapp_token        VARCHAR(255) NULL,
  whatsapp_number       VARCHAR(30) NULL,
  smoove_enabled        TINYINT(1) NOT NULL DEFAULT 0,
  smoove_token          VARCHAR(255) NULL,
  smoove_by_status      TINYINT(1) NOT NULL DEFAULT 0,
  smoove_by_parameter   VARCHAR(255) NULL,
  -- telephony
  default_phone_redirect        VARCHAR(30) NULL,
  default_phone_redirect_close  VARCHAR(30) NULL,
  -- flags
  contacts_access       TINYINT(1) NOT NULL DEFAULT 0,
  is_donation_center    TINYINT(1) NOT NULL DEFAULT 0,
  -- billing
  payment_package       VARCHAR(20) NULL,
  payment_agent         INT NULL,
  phone_limit           INT NULL,
  expiration_date       DATETIME NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  suspended_at          DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_companies_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  UNIQUE KEY uq_companies_token (public_token),
  UNIQUE KEY uq_companies_legacy (legacy_id),
  INDEX idx_companies_agency (agency_id),
  INDEX idx_companies_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS services (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  description           TEXT NULL,
  service_type          VARCHAR(20) NULL,
  public_hash           VARCHAR(72) NOT NULL,
  phone_service_number  VARCHAR(20) NULL,
  site_url              VARCHAR(500) NULL,
  is_import_service     TINYINT(1) NOT NULL DEFAULT 0,
  is_whatsapp_service   TINYINT(1) NOT NULL DEFAULT 0,
  distribute_leads      TEXT NULL,
  service_ref           VARCHAR(100) NULL,
  export_webhook_url    VARCHAR(500) NULL,
  line_type             VARCHAR(50) NULL,
  returning_sms_from    VARCHAR(20) NULL,
  returning_sms_text    VARCHAR(500) NULL,
  open_hours            TEXT NULL,
  close_hours_phone     VARCHAR(30) NULL,
  close_hours_audio_url VARCHAR(500) NULL,
  close_hours_config    TEXT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_services_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_services_hash (public_hash),
  UNIQUE KEY uq_services_legacy (legacy_id),
  INDEX idx_services_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 2. Telephony / IVR ----------

CREATE TABLE IF NOT EXISTS phone_numbers (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NULL,
  service_id            BIGINT UNSIGNED NULL,
  ivr_provider          ENUM('native','micropay','paycall','maskyoo') NOT NULL DEFAULT 'native',
  phone_number          VARCHAR(30) NOT NULL,
  number_to_display     VARCHAR(30) NULL,
  redirect_to_number    VARCHAR(50) NULL,
  redirect_config       TEXT NULL,
  is_premium            TINYINT(1) NOT NULL DEFAULT 0,
  open_hours            TEXT NULL,
  close_hours_phone     VARCHAR(30) NULL,
  is_visible            TINYINT(1) NOT NULL DEFAULT 1,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_phones_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_phones_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  INDEX idx_phones_company (company_id),
  INDEX idx_phones_number (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS special_redirects (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  virtual_number        VARCHAR(20) NOT NULL,
  caller_number         VARCHAR(20) NOT NULL,
  redirect_to           VARCHAR(30) NOT NULL,
  INDEX idx_special_virtual (virtual_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------- 3. Users ----------
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NULL,
  agency_id             BIGINT UNSIGNED NULL,
  role                  ENUM('super_admin','agency_admin','company_admin','company_user','translator') NOT NULL DEFAULT 'company_user',
  username              VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) NULL,
  first_name            VARCHAR(50) NULL,
  last_name             VARCHAR(50) NULL,
  display_name          VARCHAR(100) NULL,
  phone                 VARCHAR(30) NULL,
  password_hash         VARCHAR(255) NULL,
  google_id             VARCHAR(255) NULL,
  language              VARCHAR(5) NULL DEFAULT 'he',
  notifications         JSON NULL,
  email_notifications   JSON NULL,
  phone_notifications   JSON NULL,
  contacts_access       TINYINT(1) NOT NULL DEFAULT 0,
  current_status        VARCHAR(15) NULL,
  last_seen_at          DATETIME NULL,
  temporary_password    VARCHAR(20) NULL,
  temporary_password_expiry DATETIME NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  suspended_at          DATETIME NULL,
  suspended_until       DATETIME NULL,
  restrictions          TEXT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_legacy (legacy_id),
  INDEX idx_users_company (company_id),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invitations (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id               BIGINT UNSIGNED NOT NULL,
  company_id            BIGINT UNSIGNED NULL,
  inviting_user_id      BIGINT UNSIGNED NULL,
  sent_at               DATETIME NULL,
  connected_at          DATETIME NULL,
  closed                TINYINT(1) NOT NULL DEFAULT 0,
  last_reminder_at      DATETIME NULL,
  CONSTRAINT fk_invit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_invit_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_restrictions (
  user_id               BIGINT UNSIGNED PRIMARY KEY,
  login_hours           VARCHAR(1000) NULL,
  login_source          VARCHAR(1000) NULL,
  CONSTRAINT fk_restrict_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 4. Statuses & Tags ----------

CREATE TABLE IF NOT EXISTS lead_statuses (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  text                  VARCHAR(50) NOT NULL,
  color                 VARCHAR(10) NULL,
  sort_order            INT NOT NULL DEFAULT 0,
  is_static             TINYINT(1) NOT NULL DEFAULT 0,
  is_waiting            TINYINT(1) NOT NULL DEFAULT 0,
  is_finished           TINYINT(1) NOT NULL DEFAULT 0,
  for_notification      TINYINT(1) NOT NULL DEFAULT 0,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_status_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_status_legacy (legacy_id),
  INDEX idx_status_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tags (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  label                 VARCHAR(50) NOT NULL,
  is_hidden             TINYINT(1) NOT NULL DEFAULT 0,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_tags_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_tags_legacy (legacy_id),
  INDEX idx_tags_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 5. Contacts ----------

CREATE TABLE IF NOT EXISTS contacts (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  first_name            VARCHAR(50) NULL,
  last_name             VARCHAR(50) NULL,
  phone                 VARCHAR(30) NULL,
  phone2                VARCHAR(30) NULL,
  email                 VARCHAR(100) NULL,
  info                  LONGTEXT NULL,
  status                INT NULL,
  img                   VARCHAR(500) NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_contacts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_contacts_legacy (legacy_id),
  INDEX idx_contacts_company (company_id),
  INDEX idx_contacts_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id            BIGINT UNSIGNED NOT NULL,
  tag_id                BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (contact_id, tag_id),
  CONSTRAINT fk_ctag_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ctag_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_conversations (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  contact_id            BIGINT UNSIGNED NOT NULL,
  user_id               BIGINT UNSIGNED NULL,
  content               LONGTEXT NULL,
  send_by               VARCHAR(12) NULL,
  comment               VARCHAR(50) NULL,
  from_me               TINYINT(1) NOT NULL DEFAULT 0,
  unread                TINYINT(1) NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cconv_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  INDEX idx_cconv_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------- 6. Leads ----------
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS leads (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  service_id            BIGINT UNSIGNED NULL,
  status_id             BIGINT UNSIGNED NULL,
  contact_id            BIGINT UNSIGNED NULL,
  current_agent_id      BIGINT UNSIGNED NULL,
  lead_name             VARCHAR(100) NULL,
  lead_phone            VARCHAR(20) NULL,
  lead_email            VARCHAR(255) NULL,
  lead_info             LONGTEXT NULL,
  lead_rating           TINYINT NULL,
  lead_through          VARCHAR(20) NULL,
  is_converted          TINYINT(1) NOT NULL DEFAULT 0,
  new_messages          TINYINT(1) NOT NULL DEFAULT 0,
  facebook_id           VARCHAR(255) NULL,
  referrer              VARCHAR(2000) NULL,
  ip_address            VARCHAR(45) NULL,
  browser_name          VARCHAR(30) NULL,
  platform              VARCHAR(30) NULL,
  last_interaction_at   DATETIME NULL,
  last_interaction_type VARCHAR(30) NULL,
  recording_url         VARCHAR(500) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_leads_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_leads_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_status FOREIGN KEY (status_id) REFERENCES lead_statuses(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_agent FOREIGN KEY (current_agent_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_leads_legacy (legacy_id),
  INDEX idx_leads_company_date (company_id, created_at),
  INDEX idx_leads_service (service_id),
  INDEX idx_leads_status (status_id),
  INDEX idx_leads_phone (lead_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id               BIGINT UNSIGNED NOT NULL,
  tag_id                BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (lead_id, tag_id),
  CONSTRAINT fk_ltag_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_ltag_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_conversations (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  lead_id               BIGINT UNSIGNED NOT NULL,
  user_id               BIGINT UNSIGNED NULL,
  content               LONGTEXT NULL,
  send_by               VARCHAR(10) NULL,
  comment               VARCHAR(50) NULL,
  from_me               TINYINT(1) NOT NULL DEFAULT 0,
  unread                TINYINT(1) NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lconv_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX idx_lconv_lead (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reminders (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  lead_id               BIGINT UNSIGNED NOT NULL,
  user_id               BIGINT UNSIGNED NULL,
  lead_name             VARCHAR(100) NULL,
  reminder_at           DATETIME NOT NULL,
  comment               TEXT NULL,
  CONSTRAINT fk_reminder_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX idx_reminder_user_date (user_id, reminder_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS message_templates (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  agency_id             BIGINT UNSIGNED NULL,
  name                  VARCHAR(100) NOT NULL,
  type                  VARCHAR(20) NULL,
  category              VARCHAR(100) NULL,
  language              VARCHAR(10) NULL,
  namespace             VARCHAR(255) NULL,
  header                TEXT NULL,
  body                  VARCHAR(1000) NULL,
  footer                TEXT NULL,
  buttons               TEXT NULL,
  parameters            VARCHAR(1000) NULL,
  is_template           TINYINT(1) NOT NULL DEFAULT 1,
  for_whatsapp          TINYINT(1) NOT NULL DEFAULT 0,
  for_sms               TINYINT(1) NOT NULL DEFAULT 0,
  legacy_id             BIGINT UNSIGNED NULL,
  CONSTRAINT fk_tmpl_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_tmpl_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 8. Billing ----------

CREATE TABLE IF NOT EXISTS payment_packages (
  id                    VARCHAR(20) PRIMARY KEY,
  price                 FLOAT NOT NULL DEFAULT 0,
  users                 INT NULL,
  additional_user_price FLOAT NULL,
  phones                INT NULL,
  additional_phone_price FLOAT NULL,
  call_minutes          INT NULL,
  additional_minute_price FLOAT NULL,
  unlimited_minutes_price FLOAT NULL,
  leads                 INT NULL,
  additional_lead_price FLOAT NULL,
  unlimited_leads_price FLOAT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plans (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pay_per_month         FLOAT NULL,
  pay_minute_home       FLOAT NULL,
  pay_minute_mobile     FLOAT NULL,
  fix_price             FLOAT NULL,
  include_minute        INT NULL,
  line_plan             INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_defaults (
  id                    TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  currency              VARCHAR(5) NULL,
  currency_sign         VARCHAR(10) NULL,
  agency_price          FLOAT NULL,
  company_price         FLOAT NULL,
  user_price            FLOAT NULL,
  sms_price             FLOAT NULL,
  premium_virtual_phone FLOAT NULL,
  regular_virtual_phone FLOAT NULL,
  virtual_phone_minute  FLOAT NULL,
  tax_percent           FLOAT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bills (
  id                    VARCHAR(30) PRIMARY KEY,
  company_id            BIGINT UNSIGNED NULL,
  agency_id             BIGINT UNSIGNED NULL,
  type                  VARCHAR(15) NULL,
  billing_month         VARCHAR(15) NULL,
  bill_date             DATETIME NULL,
  bill_data             LONGTEXT NULL,
  INDEX idx_bills_company (company_id),
  INDEX idx_bills_month (billing_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id                    VARCHAR(30) PRIMARY KEY,
  company_id            BIGINT UNSIGNED NULL,
  payment_method        VARCHAR(30) NULL,
  icount_token_cc       VARCHAR(100) NULL,
  INDEX idx_payments_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS package_history (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  package_id            VARCHAR(30) NULL,
  start_at              DATETIME NULL,
  end_at                DATETIME NULL,
  details               LONGTEXT NULL,
  CONSTRAINT fk_pkghist_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_pkghist_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sms_records (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NULL,
  service_id            BIGINT UNSIGNED NULL,
  billing_month         VARCHAR(7) NULL,
  phone_number          VARCHAR(20) NULL,
  sms_count             INT NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sms_company_month (company_id, billing_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 9. Reports & Activity ----------

CREATE TABLE IF NOT EXISTS monthly_reports (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  month                 TINYINT NOT NULL,
  year                  SMALLINT NOT NULL,
  google_csv            LONGTEXT NULL,
  google_keywords_csv   LONGTEXT NULL,
  facebook_csv          LONGTEXT NULL,
  comment               TEXT NULL,
  CONSTRAINT fk_report_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_report_company (company_id, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS action_log (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  agency_id             BIGINT UNSIGNED NULL,
  company_id            BIGINT UNSIGNED NULL,
  service_id            BIGINT UNSIGNED NULL,
  lead_id               BIGINT UNSIGNED NULL,
  user_id               BIGINT UNSIGNED NULL,
  user_name             VARCHAR(50) NULL,
  content               TEXT NULL,
  icon                  VARCHAR(30) NULL,
  json_vars             JSON NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_actionlog_company (company_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id               BIGINT UNSIGNED NOT NULL,
  company_id            BIGINT UNSIGNED NULL,
  agency_id             BIGINT UNSIGNED NULL,
  lead_id               BIGINT UNSIGNED NULL,
  report_id             VARCHAR(30) NULL,
  content               TEXT NULL,
  is_read               TINYINT(1) NOT NULL DEFAULT 0,
  is_received           TINYINT(1) NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS languages (
  slug                  VARCHAR(5) PRIMARY KEY,
  language              VARCHAR(50) NOT NULL,
  language_english      VARCHAR(50) NULL,
  dir                   VARCHAR(5) NOT NULL DEFAULT 'ltr',
  is_rtl                TINYINT(1) NOT NULL DEFAULT 0,
  is_active             TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS translation_strings (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  lang_slug             VARCHAR(5) NOT NULL,
  string_key            VARCHAR(255) NOT NULL,
  string_value          TEXT NULL,
  CONSTRAINT fk_trans_lang FOREIGN KEY (lang_slug) REFERENCES languages(slug) ON DELETE CASCADE,
  UNIQUE KEY uq_trans (lang_slug, string_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

SET FOREIGN_KEY_CHECKS = 0;
CREATE TABLE IF NOT EXISTS company_files (
  id                    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id            BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id   BIGINT UNSIGNED NULL,
  file_name             VARCHAR(255) NOT NULL,
  file_url              VARCHAR(500) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cfiles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_cfiles_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;
