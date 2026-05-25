const { getDb } = require('../database/db');
const { ok, fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { required, toNumber } = require('../utils/validators');

const ACTIVE = ['waiting', 'called', 'serving'];

async function createNotification(db, userId, title, body, type = 'general', bookingId = null) {
  await db.run(
    'INSERT INTO notifications (user_id, title, body, type, booking_id) VALUES (?, ?, ?, ?, ?)',
    [userId, title, body, type, bookingId]
  );
}

async function addEvent(db, bookingId, oldStatus, newStatus, actorId, note = null) {
  await db.run(
    'INSERT INTO queue_events (booking_id, old_status, new_status, actor_user_id, note) VALUES (?, ?, ?, ?, ?)',
    [bookingId, oldStatus, newStatus, actorId || null, note]
  );
}

async function bookingWithDetails(db, id) {
  return db.get(`
    SELECT b.*, u.name AS driver_name, u.phone AS driver_phone,
           s.name AS station_name, s.city, ft.name AS fuel_name, ft.code AS fuel_code
    FROM bookings b
    JOIN users u ON u.id = b.driver_user_id
    JOIN stations s ON s.id = b.station_id
    JOIN fuel_types ft ON ft.id = b.fuel_type_id
    WHERE b.id = ?
  `, [id]);
}

async function nextQueueNumber(db, stationId, fuelTypeId) {
  const row = await db.get(`
    SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_no
    FROM bookings
    WHERE station_id = ? AND fuel_type_id = ? AND DATE(created_at) = DATE('now')
  `, [stationId, fuelTypeId]);
  return row.next_no;
}

async function estimateWait(db, stationId, fuelTypeId) {
  const row = await db.get(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE station_id = ? AND fuel_type_id = ? AND status IN ('waiting','called','serving')
  `, [stationId, fuelTypeId]);
  const avgServiceMinutes = 6;
  return Number(row.count || 0) * avgServiceMinutes;
}

exports.createBooking = asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') return fail(res, 'الحجز متاح لحساب السائق فقط', 403);
  const missing = required(req.body, ['station_id', 'fuel_type_id']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);

  const db = await getDb();
  const existing = await db.get(`
    SELECT id FROM bookings
    WHERE driver_user_id = ? AND status IN ('waiting','called','serving')
  `, [req.user.id]);
  if (existing) return fail(res, 'لديك حجز نشط بالفعل. يرجى إكماله أو إلغاؤه أولاً', 409);

  const stationFuel = await db.get(`
    SELECT sf.*, s.status AS station_status, ft.name AS fuel_name
    FROM station_fuel sf
    JOIN stations s ON s.id = sf.station_id
    JOIN fuel_types ft ON ft.id = sf.fuel_type_id
    WHERE sf.station_id = ? AND sf.fuel_type_id = ?
  `, [req.body.station_id, req.body.fuel_type_id]);
  if (!stationFuel) return fail(res, 'بيانات المحطة أو نوع الوقود غير صحيحة', 404);
  if (stationFuel.station_status !== 'open' && stationFuel.station_status !== 'busy') return fail(res, 'المحطة غير متاحة للحجز حالياً', 400);
  if (stationFuel.is_available !== 1 || stationFuel.quantity_liters <= 0) return fail(res, 'هذا النوع من الوقود غير متوفر حالياً', 400);

  const queueNo = await nextQueueNumber(db, req.body.station_id, req.body.fuel_type_id);
  const waitMinutes = await estimateWait(db, req.body.station_id, req.body.fuel_type_id);

  const result = await db.run(`
    INSERT INTO bookings (driver_user_id, station_id, fuel_type_id, queue_number, estimated_wait_minutes, requested_liters, vehicle_plate, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id,
    req.body.station_id,
    req.body.fuel_type_id,
    queueNo,
    waitMinutes,
    req.body.requested_liters ?? null,
    req.body.vehicle_plate || null,
    req.body.notes || null,
  ]);

  await addEvent(db, result.lastID, null, 'waiting', req.user.id, 'تم إنشاء الحجز');
  await createNotification(db, req.user.id, 'تم حجز دورك بنجاح', `رقم دورك هو ${queueNo} والانتظار المتوقع ${waitMinutes} دقيقة`, 'booking', result.lastID);
  return ok(res, await bookingWithDetails(db, result.lastID), 'تم إنشاء الحجز بنجاح', 201);
});

exports.myBookings = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all(`
    SELECT b.*, s.name AS station_name, s.city, ft.name AS fuel_name, ft.code AS fuel_code
    FROM bookings b
    JOIN stations s ON s.id = b.station_id
    JOIN fuel_types ft ON ft.id = b.fuel_type_id
    WHERE b.driver_user_id = ?
    ORDER BY b.id DESC
  `, [req.user.id]);
  return ok(res, rows);
});

exports.stationQueue = asyncHandler(async (req, res) => {
  const db = await getDb();
  const params = [req.params.stationId];
  let fuelFilter = '';
  if (req.query.fuel_type_id) {
    fuelFilter = 'AND b.fuel_type_id = ?';
    params.push(req.query.fuel_type_id);
  }
  const rows = await db.all(`
    SELECT b.*, u.name AS driver_name, u.phone AS driver_phone, ft.name AS fuel_name
    FROM bookings b
    JOIN users u ON u.id = b.driver_user_id
    JOIN fuel_types ft ON ft.id = b.fuel_type_id
    WHERE b.station_id = ? AND b.status IN ('waiting','called','serving') ${fuelFilter}
    ORDER BY b.fuel_type_id, b.queue_number ASC
  `, params);
  return ok(res, rows);
});

exports.updateBookingStatus = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['status']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);
  const allowed = ['waiting','called','serving','completed','cancelled','missed'];
  if (!allowed.includes(req.body.status)) return fail(res, 'حالة الحجز غير صحيحة');

  const db = await getDb();
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return fail(res, 'الحجز غير موجود', 404);

  if (req.user.role !== 'admin' && ['station_manager', 'employee'].includes(req.user.role) && Number(req.user.station_id) !== Number(booking.station_id)) {
    return fail(res, 'ليس لديك صلاحية على هذا الحجز', 403);
  }
  if (req.user.role === 'driver' && Number(booking.driver_user_id) !== Number(req.user.id)) {
    return fail(res, 'ليس لديك صلاحية على هذا الحجز', 403);
  }
  if (req.user.role === 'driver' && req.body.status !== 'cancelled') {
    return fail(res, 'السائق يمكنه إلغاء الحجز فقط', 403);
  }

  const statusColumn = {
    called: 'called_at',
    serving: 'service_started_at',
    completed: 'completed_at',
    cancelled: 'cancelled_at',
    missed: 'completed_at',
  }[req.body.status];
  const setTime = statusColumn ? `, ${statusColumn} = CURRENT_TIMESTAMP` : '';

  await db.run(`UPDATE bookings SET status = ? ${setTime} WHERE id = ?`, [req.body.status, req.params.id]);
  await addEvent(db, req.params.id, booking.status, req.body.status, req.user.id, req.body.note || null);

  if (req.body.status === 'called') {
    await createNotification(db, booking.driver_user_id, 'اقترب دورك', `يرجى التوجه إلى المحطة. رقم الدور ${booking.queue_number}`, 'queue', booking.id);
  }
  if (req.body.status === 'completed') {
    const requested = toNumber(booking.requested_liters, 0);
    if (requested > 0) {
      await db.run(`
        UPDATE station_fuel
        SET quantity_liters = CASE WHEN quantity_liters - ? < 0 THEN 0 ELSE quantity_liters - ? END,
            updated_at = CURRENT_TIMESTAMP
        WHERE station_id = ? AND fuel_type_id = ?
      `, [requested, requested, booking.station_id, booking.fuel_type_id]);
    }
    await createNotification(db, booking.driver_user_id, 'تم إنهاء الخدمة', 'تم تسجيل انتهاء عملية التزود بالوقود بنجاح', 'booking', booking.id);
  }

  return ok(res, await bookingWithDetails(db, req.params.id), 'تم تحديث حالة الحجز');
});

exports.cancelBooking = asyncHandler(async (req, res) => {
  req.body.status = 'cancelled';
  return exports.updateBookingStatus(req, res);
});
