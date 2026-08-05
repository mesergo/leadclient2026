function notFound(req, res) {
  res.status(404).json({ error: 'לא נמצא' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.expose ? err.message : 'שגיאת שרת' });
}

module.exports = { notFound, errorHandler };
