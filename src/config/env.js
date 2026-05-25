const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const rootDir = path.join(__dirname, '../..');

module.exports = {
  port: Number(process.env.PORT || 8000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbPath: path.isAbsolute(process.env.DB_PATH || '')
    ? process.env.DB_PATH
    : path.join(rootDir, process.env.DB_PATH || './database/fuel_queue.sqlite'),
};
