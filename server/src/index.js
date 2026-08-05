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
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'leadclient-api', env: config.env }));

app.use('/api/auth', require('./routes/auth'));
require('./routes')(app);

app.use('/api', notFound);

// serve built client (production) with SPA fallback
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => console.log(`LeadClient on http://localhost:${config.port} (${config.env})`));
}
module.exports = app;
