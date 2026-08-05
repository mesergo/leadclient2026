require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  uploadDir: process.env.UPLOAD_DIR || require('path').resolve(__dirname, '../../public/uploads'),
};
