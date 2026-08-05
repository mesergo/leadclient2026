const test = require('node:test');
const assert = require('node:assert');
const int = require('../src/services/integrations');

test('all adapters return mocked result, no external side effects', async () => {
  const r1 = await int.sms.send({ to: '050', text: 'hi' });
  assert.strictEqual(r1.mocked, true);
  assert.strictEqual(r1.provider, 'mesergo');
  const r2 = await int.whatsapp.send({ to: '050', template: 't' });
  assert.strictEqual(r2.mocked, true);
  const r3 = await int.ivr.setRedirect({ number: '073', redirectTo: '050' });
  assert.strictEqual(r3.mocked, true);
  const r4 = await int.billing.charge({ companyId: 1, amount: 49 });
  assert.strictEqual(r4.mocked, true);
  const r5 = await int.emailMarketing.syncContact({ contact: { email: 'a@b.c' } });
  assert.strictEqual(r5.mocked, true);
});

test('billing.charge never exposes the raw token', async () => {
  const r = await int.billing.charge({ companyId: 1, amount: 10, token: 'secret' });
  assert.strictEqual(r.payload.hasToken, true);
  assert.strictEqual(JSON.stringify(r).includes('secret'), false);
});
