const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
// behind one reverse proxy (Coolify/Traefik): take the client IP from X-Forwarded-For,
// so rate limits count per user and not for everyone together
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// rate limits per client IP on the unauthenticated / SMS-sending entry points (not on the
// Maskyoo call webhook: all calls come from Maskyoo's few IPs)
const limit = (minutes, max) => rateLimit({ windowMs: minutes * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות, נסו שוב מאוחר יותר' } });
app.use('/api/auth/login', limit(15, 50));
app.use('/api/auth/phone/request', limit(15, 10));            // sends an SMS
app.use('/api/auth/phone/verify-request', limit(15, 10));     // sends an SMS (logged-in)
app.use(['/api/auth/phone/verify', '/api/auth/phone/verify-confirm'], limit(15, 30)); // code guesses
app.use(['/api/auth/register', '/api/auth/google'], limit(15, 30));
app.use('/api/public/invite', limit(15, 60));
app.use('/api/public/leads', limit(10, 300));                 // lead intake forms / widget (servers may post batches)

// call recordings live in uploads/.recordings (the persistent volume) and must only be served
// through the authed/signed proxy — never statically. express.static's default ('ignore') only
// hides a dot in the LAST path segment, so deny dot-paths explicitly, plus a hard 404 guard.
app.use('/uploads', (req, res, next) => {
  let p;
  try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
  return /(^|[\\/])\./.test(p) ? res.status(404).end() : next();
});
app.use('/uploads', express.static(config.uploadDir, { dotfiles: 'deny', setHeaders: require('./services/uploads').staticHeaders }));
app.get('/api/health', async (req, res) => {
  const out = { ok: true, service: 'leadclient-api', env: config.env, timezone: config.timezone };
  try {
    // server vs DB clock — both should read Israel time
    const fmt = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone, dateStyle: 'short', timeStyle: 'medium' }).format(d);
    const [r] = await require('./db/pool').query(
      'SELECT NOW() AS db_now, @@session.time_zone AS db_session_tz, @@global.time_zone AS db_global_tz, @@system_time_zone AS db_system_tz');
    out.time = { server_now: fmt(new Date()), ...r };
  } catch (e) { out.time = { error: e.message }; }
  // push readiness only (true/false) — never any part of the keys
  out.push = { mobile_fcm: require('./services/fcm').isReady(), web: require('./services/notify').isPushReady() };
  res.json(out);
});

app.use('/api/auth', require('./routes/auth'));
require('./routes')(app);

app.use('/api', notFound);

// public account-deletion page (the URL listed in Google Play)
const deletePage = path.resolve(__dirname, 'pages/delete-account.html');
app.get(['/delete-account', '/account-deletion'], (req, res) => res.sendFile(deletePage));

// mobile app as an installable web app (PWA for iPhone) — built from leadclient-mobile (build-web.sh)
const mobileDist = path.resolve(__dirname, '../../mobile-web');
if (fs.existsSync(mobileDist)) {
  app.get(/^\/m$/, (req, res) => res.redirect(301, '/m/')); // exact /m only (non-strict routing would loop on /m/)
  app.use('/m', express.static(mobileDist));
  app.get('/m/*', (req, res) => res.sendFile(path.join(mobileDist, 'index.html')));
}

// serve built client (production) with SPA fallback
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

if (require.main === module) {
  // never run production on the code's fallback JWT secret (anyone could forge any session)
  if (config.env === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    console.error('FATAL: JWT_SECRET is missing or shorter than 32 characters');
    process.exit(1);
  }
  // make sure app-managed columns exist before we accept requests
  require('./db/init').ensureSchema().finally(() => {
    app.listen(config.port, () => {
      console.log(`LeadClient on http://localhost:${config.port} (${config.env})`);
      require('./services/reminderPoller').start();
      require('./services/billingPoller').start();
      require('./services/contactsSync').start();
    });
  });
}
module.exports = app;
