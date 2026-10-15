// Verify a Google Identity Services id_token (the "credential" from the Google
// button). Checks signature against Google's keys plus aud/iss/exp. Returns the
// payload (sub, email, email_verified, name, ...) or throws.
// GOOGLE_CLIENT_ID may hold several web client ids, comma-separated (the site's and the
// mobile app's — a native Android sign-in issues its id_token for the app's web client id).
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');

const audiences = () => String(config.google.clientId || '').split(',').map((s) => s.trim()).filter(Boolean);
const client = new OAuth2Client();

async function verify(credential) {
  const aud = audiences();
  if (!aud.length) throw new Error('google_not_configured');
  const ticket = await client.verifyIdToken({ idToken: credential, audience: aud });
  return ticket.getPayload();
}

module.exports = { verify, configured: () => audiences().length > 0 };
