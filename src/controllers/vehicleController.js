
const { getDb } = require('../database/db');
const { ok, fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { required } = require('../utils/validators');

exports.listVehicles = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM vehicles WHERE user_id = ? ORDER BY is_default DESC, id DESC', [req.user.id]);
  return ok(res, rows);
});

exports.createVehicle = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['plate_number']);
  if (missing.length) return fail(res, 'رقم اللوحة مطلوب');
  const db = await getDb();
  const count = await db.get('SELECT COUNT(*) AS c FROM vehicles WHERE user_id = ?', [req.user.id]);
  const isDefault = count.c === 0 || req.body.is_default ? 1 : 0;
  if (isDefault) await db.run('UPDATE vehicles SET is_default = 0 WHERE user_id = ?', [req.user.id]);
  const result = await db.run(
    'INSERT INTO vehicles (user_id, plate_number, vehicle_type, color, is_default) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, String(req.body.plate_number).trim(), req.body.vehicle_type || 'سيارة', req.body.color || null, isDefault]
  );
  const row = await db.get('SELECT * FROM vehicles WHERE id = ?', [result.lastID]);
  return ok(res, row, 'تمت إضافة المركبة', 201);
});

exports.updateVehicle = asyncHandler(async (req, res) => {
  const db = await getDb();
  const vehicle = await db.get('SELECT * FROM vehicles WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!vehicle) return fail(res, 'المركبة غير موجودة', 404);
  const isDefault = req.body.is_default === true || req.body.is_default === 1 ? 1 : vehicle.is_default;
  if (isDefault) await db.run('UPDATE vehicles SET is_default = 0 WHERE user_id = ?', [req.user.id]);
  await db.run(
    `UPDATE vehicles SET plate_number = ?, vehicle_type = ?, color = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    [req.body.plate_number ?? vehicle.plate_number, req.body.vehicle_type ?? vehicle.vehicle_type, req.body.color ?? vehicle.color, isDefault, req.params.id, req.user.id]
  );
  const row = await db.get('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
  return ok(res, row, 'تم تحديث المركبة');
});

exports.deleteVehicle = asyncHandler(async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM vehicles WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  return ok(res, {}, 'تم حذف المركبة');
});
