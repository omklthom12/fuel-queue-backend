const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { fail } = require('../utils/apiResponse');
const { getDb } = require('../database/db');

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 'يجب تسجيل الدخول أولاً', 401);

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const db = await getDb();
    const user = await db.get(
      'SELECT id, name, phone, email, role, station_id, is_active FROM users WHERE id = ?',
      [payload.id]
    );
    if (!user || user.is_active !== 1) return fail(res, 'الحساب غير موجود أو غير مفعل', 401);
    req.user = user;
    return next();
  } catch (error) {
    return fail(res, 'جلسة الدخول غير صالحة', 401);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 'يجب تسجيل الدخول أولاً', 401);
    if (!roles.includes(req.user.role)) return fail(res, 'ليس لديك صلاحية لتنفيذ العملية', 403);
    return next();
  };
}

function canAccessStation(req, res, next) {
  if (!req.user) return fail(res, 'يجب تسجيل الدخول أولاً', 401);
  if (req.user.role === 'admin') return next();
  const stationId = Number(req.params.stationId || req.params.id || req.body.station_id);
  if (['station_manager', 'employee'].includes(req.user.role) && Number(req.user.station_id) === stationId) {
    return next();
  }
  return fail(res, 'ليس لديك صلاحية على هذه المحطة', 403);
}

module.exports = { auth, allowRoles, canAccessStation };
