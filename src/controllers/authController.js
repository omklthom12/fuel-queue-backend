const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const env = require('../config/env');
const { ok, fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { required, normalizePhone } = require('../utils/validators');

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: '30d' });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    station_id: user.station_id,
  };
}

exports.register = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['name', 'phone', 'password']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);

  const db = await getDb();
  const phone = normalizePhone(req.body.phone);
  const exists = await db.get('SELECT id FROM users WHERE phone = ? OR email = ?', [phone, req.body.email || null]);
  if (exists) return fail(res, 'رقم الجوال أو البريد مستخدم مسبقاً', 409);

  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const result = await db.run(
    `INSERT INTO users (name, phone, email, password_hash, role, station_id)
     VALUES (?, ?, ?, ?, 'driver', NULL)`,
    [req.body.name.trim(), phone, req.body.email || null, passwordHash]
  );
  const user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
  return ok(res, { user: publicUser(user), token: signToken(user) }, 'تم إنشاء الحساب بنجاح', 201);
});

exports.login = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['phone', 'password']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);

  const db = await getDb();
  const phone = normalizePhone(req.body.phone);
  const user = await db.get('SELECT * FROM users WHERE phone = ?', [phone]);
  if (!user) return fail(res, 'بيانات الدخول غير صحيحة', 401);

  const match = await bcrypt.compare(req.body.password, user.password_hash);
  if (!match) return fail(res, 'بيانات الدخول غير صحيحة', 401);

  return ok(res, { user: publicUser(user), token: signToken(user) }, 'تم تسجيل الدخول بنجاح');
});

exports.me = asyncHandler(async (req, res) => {
  return ok(res, { user: publicUser(req.user) });
});


exports.updateProfile = asyncHandler(async (req, res) => {
  const db = await getDb();
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim() || null;
  const phone = req.body.phone ? normalizePhone(req.body.phone) : req.user.phone;

  if (!name) return fail(res, 'الاسم مطلوب');

  const exists = await db.get(
    'SELECT id FROM users WHERE (phone = ? OR email = ?) AND id != ?',
    [phone, email, req.user.id]
  );
  if (exists) return fail(res, 'رقم الهاتف أو البريد مستخدم في حساب آخر', 409);

  await db.run(
    `UPDATE users SET name = ?, phone = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, phone, email, req.user.id]
  );
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  return ok(res, { user: publicUser(user) }, 'تم تحديث بيانات الحساب بنجاح');
});

exports.changePassword = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['current_password', 'new_password']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);
  if (String(req.body.new_password).length < 6) return fail(res, 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');

  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const match = await bcrypt.compare(req.body.current_password, user.password_hash);
  if (!match) return fail(res, 'كلمة المرور الحالية غير صحيحة', 401);

  const passwordHash = await bcrypt.hash(req.body.new_password, 10);
  await db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, req.user.id]);
  return ok(res, {}, 'تم تغيير كلمة المرور بنجاح');
});
