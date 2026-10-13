const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));

app.use('/uploads', express.static(config.uploadDir));
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
  // make sure app-managed columns exist before we accept requests
  require('./db/init').ensureSchema().finally(() => {
    app.listen(config.port, () => {
      console.log(`LeadClient on http://localhost:${config.port} (${config.env})`);
      require('./services/reminderPoller').start();
      require('./services/billingPoller').start();
    });
  });
}
module.exports = app;
