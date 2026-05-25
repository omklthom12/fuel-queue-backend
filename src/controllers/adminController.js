const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { ok, fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { required, normalizePhone } = require('../utils/validators');

function isAdmin(user) { return user.role === 'admin'; }
function stationScope(user, alias = 's') {
  if (isAdmin(user)) return { where: '', params: [] };
  return { where: ` AND ${alias}.id = ?`, params: [user.station_id] };
}
function bookingScope(user, alias = 'b') {
  if (isAdmin(user)) return { where: '', params: [] };
  return { where: ` AND ${alias}.station_id = ?`, params: [user.station_id] };
}
function ensureAdmin(req, res) {
  if (!isAdmin(req.user)) { fail(res, 'هذه العملية متاحة لمدير النظام فقط', 403); return false; }
  return true;
}

exports.listUsers = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all(`
    SELECT u.id, u.name, u.phone, u.email, u.role, u.station_id, s.name AS station_name, u.is_active, u.created_at
    FROM users u LEFT JOIN stations s ON s.id = u.station_id
    ORDER BY u.id DESC
  `);
  return ok(res, rows);
});

exports.createUser = asyncHandler(async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const missing = required(req.body, ['name','phone','password','role']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);
  const role = req.body.role;
  if (!['admin','station_manager','employee','driver'].includes(role)) return fail(res, 'الدور غير صحيح');
  const db = await getDb();
  const phone = normalizePhone(req.body.phone);
  const exists = await db.get('SELECT id FROM users WHERE phone = ? OR email = ?', [phone, req.body.email || null]);
  if (exists) return fail(res, 'رقم الهاتف أو البريد مستخدم مسبقاً', 409);
  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const result = await db.run(`
    INSERT INTO users (name, phone, email, password_hash, role, station_id, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [req.body.name.trim(), phone, req.body.email || null, passwordHash, role, req.body.station_id || null, req.body.is_active === 0 ? 0 : 1]);
  return ok(res, { id: result.lastID }, 'تم إنشاء المستخدم بنجاح', 201);
});

exports.updateUser = asyncHandler(async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const db = await getDb();
  const id = Number(req.params.id);
  const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return fail(res, 'المستخدم غير موجود', 404);
  const name = (req.body.name || user.name).trim();
  const phone = req.body.phone ? normalizePhone(req.body.phone) : user.phone;
  const email = req.body.email !== undefined ? (req.body.email || null) : user.email;
  const role = req.body.role || user.role;
  if (!['admin','station_manager','employee','driver'].includes(role)) return fail(res, 'الدور غير صحيح');
  const exists = await db.get('SELECT id FROM users WHERE (phone = ? OR email = ?) AND id != ?', [phone, email, id]);
  if (exists) return fail(res, 'رقم الهاتف أو البريد مستخدم في حساب آخر', 409);
  await db.run(`
    UPDATE users SET name=?, phone=?, email=?, role=?, station_id=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `, [name, phone, email, role, req.body.station_id || null, req.body.is_active === 0 ? 0 : 1, id]);
  if (req.body.password) {
    const hash = await bcrypt.hash(req.body.password, 10);
    await db.run('UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [hash, id]);
  }
  return ok(res, {}, 'تم تحديث المستخدم بنجاح');
});

exports.deleteUser = asyncHandler(async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (id === req.user.id) return fail(res, 'لا يمكنك حذف حسابك الحالي');
  const db = await getDb();
  await db.run('DELETE FROM users WHERE id = ?', [id]);
  return ok(res, {}, 'تم حذف المستخدم بنجاح');
});

exports.deleteStation = asyncHandler(async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const db = await getDb();
  await db.run('DELETE FROM stations WHERE id = ?', [req.params.id]);
  return ok(res, {}, 'تم حذف المحطة بنجاح');
});

exports.listBookings = asyncHandler(async (req, res) => {
  const db = await getDb();
  const params = [];
  let filters = 'WHERE 1=1';
  const scope = bookingScope(req.user, 'b'); filters += scope.where; params.push(...scope.params);
  if (req.query.status) { filters += ' AND b.status = ?'; params.push(req.query.status); }
  if (req.query.station_id && isAdmin(req.user)) { filters += ' AND b.station_id = ?'; params.push(req.query.station_id); }
  const rows = await db.all(`
    SELECT b.*, u.name AS driver_name, u.phone AS driver_phone, s.name AS station_name, ft.name AS fuel_name
    FROM bookings b
    JOIN users u ON u.id=b.driver_user_id
    JOIN stations s ON s.id=b.station_id
    JOIN fuel_types ft ON ft.id=b.fuel_type_id
    ${filters}
    ORDER BY b.id DESC LIMIT 300
  `, params);
  return ok(res, rows);
});

exports.deleteBooking = asyncHandler(async (req, res) => {
  const db = await getDb();
  const row = await db.get('SELECT * FROM bookings WHERE id=?', [req.params.id]);
  if (!row) return fail(res, 'الحجز غير موجود', 404);
  if (!isAdmin(req.user) && Number(row.station_id) !== Number(req.user.station_id)) return fail(res, 'ليس لديك صلاحية على هذا الحجز', 403);
  await db.run('DELETE FROM bookings WHERE id=?', [req.params.id]);
  return ok(res, {}, 'تم حذف الحجز');
});

exports.listPumps = asyncHandler(async (req, res) => {
  const db = await getDb();
  const params = [];
  let where = 'WHERE 1=1';
  if (!isAdmin(req.user)) { where += ' AND p.station_id=?'; params.push(req.user.station_id); }
  if (req.query.station_id && isAdmin(req.user)) { where += ' AND p.station_id=?'; params.push(req.query.station_id); }
  const rows = await db.all(`
    SELECT p.*, s.name AS station_name, ft.name AS fuel_name
    FROM pumps p JOIN stations s ON s.id=p.station_id JOIN fuel_types ft ON ft.id=p.fuel_type_id
    ${where} ORDER BY p.id DESC
  `, params);
  return ok(res, rows);
});

exports.createPump = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['station_id','fuel_type_id','pump_number']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);
  if (!isAdmin(req.user) && Number(req.body.station_id) !== Number(req.user.station_id)) return fail(res, 'ليس لديك صلاحية على هذه المحطة', 403);
  const db = await getDb();
  const result = await db.run(`INSERT INTO pumps (station_id, fuel_type_id, pump_number, status) VALUES (?,?,?,?)`, [req.body.station_id, req.body.fuel_type_id, req.body.pump_number, req.body.status || 'available']);
  return ok(res, { id: result.lastID }, 'تمت إضافة المضخة', 201);
});

exports.updatePump = asyncHandler(async (req, res) => {
  const db = await getDb();
  const pump = await db.get('SELECT * FROM pumps WHERE id=?', [req.params.id]);
  if (!pump) return fail(res, 'المضخة غير موجودة', 404);
  if (!isAdmin(req.user) && Number(pump.station_id) !== Number(req.user.station_id)) return fail(res, 'ليس لديك صلاحية', 403);
  await db.run(`UPDATE pumps SET station_id=?, fuel_type_id=?, pump_number=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [req.body.station_id || pump.station_id, req.body.fuel_type_id || pump.fuel_type_id, req.body.pump_number || pump.pump_number, req.body.status || pump.status, req.params.id]);
  return ok(res, {}, 'تم تحديث المضخة');
});

exports.deletePump = asyncHandler(async (req, res) => {
  const db = await getDb();
  const pump = await db.get('SELECT * FROM pumps WHERE id=?', [req.params.id]);
  if (!pump) return fail(res, 'المضخة غير موجودة', 404);
  if (!isAdmin(req.user) && Number(pump.station_id) !== Number(req.user.station_id)) return fail(res, 'ليس لديك صلاحية', 403);
  await db.run('DELETE FROM pumps WHERE id=?', [req.params.id]);
  return ok(res, {}, 'تم حذف المضخة');
});

exports.listFuelTypes = asyncHandler(async (req, res) => {
  const db = await getDb();
  return ok(res, await db.all('SELECT * FROM fuel_types ORDER BY id DESC'));
});
exports.createFuelType = asyncHandler(async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const missing = required(req.body, ['name','code']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);
  const db = await getDb();
  const r = await db.run('INSERT INTO fuel_types (name, code, unit_price) VALUES (?,?,?)', [req.body.name, String(req.body.code).toUpperCase(), Number(req.body.unit_price || 0)]);
  return ok(res, { id: r.lastID }, 'تمت إضافة نوع الوقود', 201);
});
exports.updateFuelType = asyncHandler(async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const db = await getDb();
  await db.run('UPDATE fuel_types SET name=?, code=?, unit_price=? WHERE id=?', [req.body.name, String(req.body.code).toUpperCase(), Number(req.body.unit_price || 0), req.params.id]);
  return ok(res, {}, 'تم تحديث نوع الوقود');
});
exports.deleteFuelType = asyncHandler(async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  const db = await getDb();
  await db.run('DELETE FROM fuel_types WHERE id=?', [req.params.id]);
  return ok(res, {}, 'تم حذف نوع الوقود');
});

exports.listTickets = asyncHandler(async (req, res) => {
  const db = await getDb();
  return ok(res, await db.all(`SELECT t.*, u.name AS user_name, u.phone AS user_phone FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 300`));
});
exports.updateTicket = asyncHandler(async (req, res) => {
  const db = await getDb();
  await db.run('UPDATE support_tickets SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [req.body.status || 'open', req.params.id]);
  return ok(res, {}, 'تم تحديث التذكرة');
});
exports.deleteTicket = asyncHandler(async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM support_tickets WHERE id=?', [req.params.id]);
  return ok(res, {}, 'تم حذف التذكرة');
});

exports.listIssueReports = asyncHandler(async (req, res) => {
  const db = await getDb();
  const params = [];
  let where = 'WHERE 1=1';
  if (!isAdmin(req.user)) { where += ' AND r.station_id=?'; params.push(req.user.station_id); }
  return ok(res, await db.all(`
    SELECT r.*, u.name AS user_name, s.name AS station_name
    FROM issue_reports r JOIN users u ON u.id=r.user_id LEFT JOIN stations s ON s.id=r.station_id
    ${where} ORDER BY r.id DESC LIMIT 300
  `, params));
});
exports.updateIssueReport = asyncHandler(async (req, res) => {
  const db = await getDb();
  const row = await db.get('SELECT * FROM issue_reports WHERE id=?', [req.params.id]);
  if (!row) return fail(res, 'البلاغ غير موجود', 404);
  if (!isAdmin(req.user) && Number(row.station_id) !== Number(req.user.station_id)) return fail(res, 'ليس لديك صلاحية', 403);
  await db.run('UPDATE issue_reports SET status=? WHERE id=?', [req.body.status || 'reviewed', req.params.id]);
  return ok(res, {}, 'تم تحديث البلاغ');
});
exports.deleteIssueReport = asyncHandler(async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM issue_reports WHERE id=?', [req.params.id]);
  return ok(res, {}, 'تم حذف البلاغ');
});

exports.listReviews = asyncHandler(async (req, res) => {
  const db = await getDb();
  const params = [];
  let where = 'WHERE 1=1';
  if (!isAdmin(req.user)) { where += ' AND r.station_id=?'; params.push(req.user.station_id); }
  return ok(res, await db.all(`
    SELECT r.*, u.name AS user_name, s.name AS station_name
    FROM station_reviews r JOIN users u ON u.id=r.user_id JOIN stations s ON s.id=r.station_id
    ${where} ORDER BY r.id DESC LIMIT 300
  `, params));
});
exports.deleteReview = asyncHandler(async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM station_reviews WHERE id=?', [req.params.id]);
  return ok(res, {}, 'تم حذف التقييم');
});
