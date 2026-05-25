const { getDb } = require('../database/db');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

function stationScope(req, alias = 'b') {
  if (req.user.role === 'admin') return { sql: '', params: [] };
  return { sql: ` AND ${alias}.station_id = ?`, params: [req.user.station_id] };
}

exports.overview = asyncHandler(async (req, res) => {
  const db = await getDb();
  const stationCondition = req.user.role === 'admin' ? '' : 'WHERE id = ?';
  const stationParams = req.user.role === 'admin' ? [] : [req.user.station_id];
  const scope = stationScope(req, 'b');

  const stations = await db.get(`SELECT COUNT(*) AS total FROM stations ${stationCondition}`, stationParams);
  const activeQueues = await db.get(`SELECT COUNT(*) AS total FROM bookings b WHERE b.status IN ('waiting','called','serving') ${scope.sql}`, scope.params);
  const completedToday = await db.get(`SELECT COUNT(*) AS total FROM bookings b WHERE b.status = 'completed' AND DATE(b.completed_at) = DATE('now') ${scope.sql}`, scope.params);
  const cancelledToday = await db.get(`SELECT COUNT(*) AS total FROM bookings b WHERE b.status = 'cancelled' AND DATE(b.cancelled_at) = DATE('now') ${scope.sql}`, scope.params);

  const fuel = await db.all(`
    SELECT s.name AS station_name, ft.name AS fuel_name, sf.quantity_liters, sf.low_stock_threshold, sf.is_available
    FROM station_fuel sf
    JOIN stations s ON s.id = sf.station_id
    JOIN fuel_types ft ON ft.id = sf.fuel_type_id
    ${req.user.role === 'admin' ? '' : 'WHERE sf.station_id = ?'}
    ORDER BY s.id, ft.id
  `, stationParams);

  const queuesByStation = await db.all(`
    SELECT s.id AS station_id, s.name AS station_name, ft.name AS fuel_name, COUNT(b.id) AS active_count
    FROM stations s
    CROSS JOIN fuel_types ft
    LEFT JOIN bookings b ON b.station_id = s.id AND b.fuel_type_id = ft.id AND b.status IN ('waiting','called','serving')
    ${req.user.role === 'admin' ? '' : 'WHERE s.id = ?'}
    GROUP BY s.id, ft.id
    ORDER BY s.id, ft.id
  `, stationParams);

  return ok(res, {
    cards: {
      stations: stations.total,
      active_queues: activeQueues.total,
      completed_today: completedToday.total,
      cancelled_today: cancelledToday.total,
    },
    fuel,
    queues_by_station: queuesByStation,
  });
});

exports.reports = asyncHandler(async (req, res) => {
  const db = await getDb();
  const scope = stationScope(req, 'b');
  const daily = await db.all(`
    SELECT DATE(b.created_at) AS day,
      COUNT(*) AS total_bookings,
      SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM bookings b
    WHERE DATE(b.created_at) >= DATE('now', '-14 day') ${scope.sql}
    GROUP BY DATE(b.created_at)
    ORDER BY day DESC
  `, scope.params);

  const service = await db.all(`
    SELECT s.name AS station_name, ft.name AS fuel_name,
      COUNT(b.id) AS completed_count,
      ROUND(AVG((julianday(b.completed_at) - julianday(b.service_started_at)) * 24 * 60), 1) AS avg_service_minutes
    FROM bookings b
    JOIN stations s ON s.id = b.station_id
    JOIN fuel_types ft ON ft.id = b.fuel_type_id
    WHERE b.status = 'completed' AND b.service_started_at IS NOT NULL AND b.completed_at IS NOT NULL ${scope.sql}
    GROUP BY s.id, ft.id
    ORDER BY completed_count DESC
  `, scope.params);

  return ok(res, { daily, service });
});
