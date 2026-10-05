// Verify a Google Identity Services id_token (the "credential" from the Google
// button). Checks signature against Google's keys plus aud/iss/exp. Returns the
// payload (sub, email, email_verified, name, ...) or throws.
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');

const client = new OAuth2Client(config.google.clientId);

async function verify(credential) {
  if (!config.google.clientId) throw new Error('google_not_configured');
  const ticket = await client.verifyIdToken({ idToken: credential, audience: config.google.clientId });
  return ticket.getPayload();
}

module.exports = { verify, configured: () => !!config.google.clientId };
