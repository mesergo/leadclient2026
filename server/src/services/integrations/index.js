// Integration adapters. Current build: MOCK/noop only — stores intent, makes NO
// external calls (no vendor keys). Swap implementations here when going live.
// See docs/ARCHITECTURE.md > Integrations.

function mockResult(provider, action, payload) {
  return { ok: true, mocked: true, provider, action, payload, at: null };
}

// --- SMS (MesserGO) ---
const sms = {
  provider: 'mesergo',
  async send({ to, text, from }) {
    return mockResult('mesergo', 'sms.send', { to, from, text });
  },
};

// --- WhatsApp (dialog360) ---
const whatsapp = {
  provider: 'dialog360',
  async send({ to, template, params }) {
    return mockResult('dialog360', 'whatsapp.send', { to, template, params });
  },
};

// --- IVR (native/micropay/paycall/maskyoo) ---
const ivr = {
  async provision({ provider, companyId, redirectTo }) {
    return mockResult(provider || 'native', 'ivr.provision', { companyId, redirectTo });
  },
  async setRedirect({ provider, number, redirectTo }) {
    return mockResult(provider || 'native', 'ivr.setRedirect', { number, redirectTo });
  },
};

// --- Billing (iCount) ---
const billing = {
  provider: 'icount',
  async charge({ companyId, amount, token }) {
    return mockResult('icount', 'billing.charge', { companyId, amount, hasToken: !!token });
  },
  async createInvoice({ companyId, lines }) {
    return mockResult('icount', 'billing.invoice', { companyId, lineCount: (lines || []).length });
  },
};

// --- Email marketing (Smoove) ---
const emailMarketing = {
  provider: 'smoove',
  async syncContact({ token, contact }) {
    return mockResult('smoove', 'contact.sync', { hasToken: !!token, email: contact && contact.email });
  },
};

module.exports = { sms, whatsapp, ivr, billing, emailMarketing, mockResult };
