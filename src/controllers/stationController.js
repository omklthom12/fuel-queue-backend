const { getDb } = require('../database/db');
const { ok, fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { required, toNumber } = require('../utils/validators');

async function stationDetails(db, stationId) {
  const station = await db.get('SELECT * FROM stations WHERE id = ?', [stationId]);
  if (!station) return null;

  const fuels = await db.all(`
    SELECT sf.id, ft.id AS fuel_type_id, ft.name, ft.code, ft.unit_price,
           sf.quantity_liters, sf.low_stock_threshold, sf.is_available, sf.updated_at
    FROM station_fuel sf
    JOIN fuel_types ft ON ft.id = sf.fuel_type_id
    WHERE sf.station_id = ?
    ORDER BY ft.id
  `, [stationId]);

  const rating = await db.get(`
    SELECT COALESCE(ROUND(AVG(rating),1),0) AS rating_avg, COUNT(*) AS reviews_count
    FROM station_reviews WHERE station_id = ?
  `, [stationId]);

  const queue = await db.all(`
    SELECT b.fuel_type_id, ft.name AS fuel_name,
      SUM(CASE WHEN b.status = 'waiting' THEN 1 ELSE 0 END) AS waiting_count,
      SUM(CASE WHEN b.status IN ('waiting','called','serving') THEN 1 ELSE 0 END) AS active_count,
      COALESCE(MIN(CASE WHEN b.status = 'waiting' THEN b.queue_number END), 0) AS next_queue_number
    FROM fuel_types ft
    LEFT JOIN bookings b ON b.fuel_type_id = ft.id AND b.station_id = ? AND b.status IN ('waiting','called','serving')
    GROUP BY ft.id
    ORDER BY ft.id
  `, [stationId]);

  return { ...station, ...rating, fuels, queue };
}

exports.listStations = asyncHandler(async (req, res) => {
  const db = await getDb();
  const city = req.query.city ? String(req.query.city).trim() : null;
  const status = req.query.status ? String(req.query.status).trim() : null;
  const where = [];
  const params = [];
  if (city) { where.push('s.city LIKE ?'); params.push(`%${city}%`); }
  if (status) { where.push('s.status = ?'); params.push(status); }

  const rows = await db.all(`
    SELECT s.*,
      COALESCE(COUNT(DISTINCT CASE WHEN b.status IN ('waiting','called','serving') THEN b.id END), 0) AS active_queue_count,
      COALESCE(ROUND(AVG(CASE WHEN b.status = 'waiting' THEN b.estimated_wait_minutes END)), 0) AS avg_wait_minutes,
      COALESCE(ROUND(AVG(r.rating),1),0) AS rating_avg,
      COUNT(DISTINCT r.id) AS reviews_count
    FROM stations s
    LEFT JOIN bookings b ON b.station_id = s.id
    LEFT JOIN station_reviews r ON r.station_id = s.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY s.id
    ORDER BY s.id DESC
  `, params);
  return ok(res, rows);
});

exports.getStation = asyncHandler(async (req, res) => {
  const db = await getDb();
  const details = await stationDetails(db, req.params.id);
  if (!details) return fail(res, 'المحطة غير موجودة', 404);
  return ok(res, details);
});

exports.createStation = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['name', 'city']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);
  const db = await getDb();
  const result = await db.run(`
    INSERT INTO stations (name, city, address, latitude, longitude, status, working_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    req.body.name.trim(), req.body.city.trim(), req.body.address || null,
    req.body.latitude ?? null, req.body.longitude ?? null,
    req.body.status || 'open', req.body.working_hours || '24/7',
  ]);

  const fuelTypes = await db.all('SELECT id FROM fuel_types ORDER BY id');
  for (const ft of fuelTypes) {
    await db.run(
      'INSERT OR IGNORE INTO station_fuel (station_id, fuel_type_id, quantity_liters, low_stock_threshold) VALUES (?, ?, ?, ?)',
      [result.lastID, ft.id, 0, 500]
    );
  }
  return ok(res, await stationDetails(db, result.lastID), 'تم إنشاء المحطة', 201);
});

exports.updateStation = asyncHandler(async (req, res) => {
  const db = await getDb();
  const station = await db.get('SELECT * FROM stations WHERE id = ?', [req.params.id]);
  if (!station) return fail(res, 'المحطة غير موجودة', 404);

  await db.run(`
    UPDATE stations SET name = ?, city = ?, address = ?, latitude = ?, longitude = ?, status = ?, working_hours = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    req.body.name ?? station.name,
    req.body.city ?? station.city,
    req.body.address ?? station.address,
    req.body.latitude ?? station.latitude,
    req.body.longitude ?? station.longitude,
    req.body.status ?? station.status,
    req.body.working_hours ?? station.working_hours,
    req.params.id,
  ]);
  return ok(res, await stationDetails(db, req.params.id), 'تم تحديث المحطة');
});

exports.updateFuel = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['fuel_type_id']);
  if (missing.length) return fail(res, `حقول مطلوبة: ${missing.join(', ')}`);
  const db = await getDb();
  const station = await db.get('SELECT id FROM stations WHERE id = ?', [req.params.stationId]);
  if (!station) return fail(res, 'المحطة غير موجودة', 404);

  await db.run(`
    INSERT INTO station_fuel (station_id, fuel_type_id, quantity_liters, low_stock_threshold, is_available, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(station_id, fuel_type_id) DO UPDATE SET
      quantity_liters = excluded.quantity_liters,
      low_stock_threshold = excluded.low_stock_threshold,
      is_available = excluded.is_available,
      updated_at = CURRENT_TIMESTAMP
  `, [
    req.params.stationId,
    req.body.fuel_type_id,
    toNumber(req.body.quantity_liters, 0),
    toNumber(req.body.low_stock_threshold, 500),
    req.body.is_available === false || req.body.is_available === 0 ? 0 : 1,
  ]);
  return ok(res, await stationDetails(db, req.params.stationId), 'تم تحديث بيانات الوقود');
});

exports.listFuelTypes = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM fuel_types ORDER BY id');
  return ok(res, rows);
});
