const env = require('../config/env');

function notFound(req, res) {
  return res.status(404).json({ success: false, message: 'المسار غير موجود' });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'حدث خطأ غير متوقع في الخادم',
    stack: env.nodeEnv === 'development' ? err.stack : undefined,
  });
}

module.exports = { notFound, errorHandler };
