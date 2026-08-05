// Registers all domain routers. Called from src/index.js.
module.exports = function registerRoutes(app) {
  app.use('/api/agencies', require('./agencies'));
  app.use('/api/companies', require('./companies'));
  app.use('/api/services', require('./services'));
  app.use('/api/statuses', require('./statuses'));
  app.use('/api/tags', require('./tags'));
  app.use('/api/users', require('./users'));
  app.use('/api/leads', require('./leads'));
  app.use('/api/contacts', require('./contacts'));
  app.use('/api/reminders', require('./reminders'));
  app.use('/api/templates', require('./templates'));
  app.use('/api/files', require('./files'));
  app.use('/api/dashboard', require('./dashboard'));
  app.use('/api/reports', require('./reports'));
  app.use('/api/billing', require('./billing'));
  app.use('/api/virtual', require('./virtual'));
  app.use('/api/profile', require('./profile'));
  app.use('/api/notifications', require('./notifications'));
  app.use('/api/language', require('./languages'));
  app.use('/api/import', require('./import'));
  app.use('/api/public', require('./public'));
};
