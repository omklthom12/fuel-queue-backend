
const { getDb } = require('../database/db');
const { ok, fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { required } = require('../utils/validators');

exports.listFavorites = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all(`
    SELECT s.*, fs.created_at AS favorited_at,
      COALESCE(SUM(CASE WHEN b.status IN ('waiting','called','serving') THEN 1 ELSE 0 END), 0) AS active_queue_count,
      COALESCE(ROUND(AVG(CASE WHEN b.status = 'waiting' THEN b.estimated_wait_minutes END)), 0) AS avg_wait_minutes,
      COALESCE(ROUND(AVG(r.rating),1),0) AS rating_avg,
      COUNT(DISTINCT r.id) AS reviews_count
    FROM favorite_stations fs
    JOIN stations s ON s.id = fs.station_id
    LEFT JOIN bookings b ON b.station_id = s.id
    LEFT JOIN station_reviews r ON r.station_id = s.id
    WHERE fs.user_id = ?
    GROUP BY s.id
    ORDER BY fs.id DESC
  `, [req.user.id]);
  return ok(res, rows);
});

exports.toggleFavorite = asyncHandler(async (req, res) => {
  const db = await getDb();
  const station = await db.get('SELECT id FROM stations WHERE id = ?', [req.params.stationId]);
  if (!station) return fail(res, 'المحطة غير موجودة', 404);
  const exists = await db.get('SELECT id FROM favorite_stations WHERE user_id = ? AND station_id = ?', [req.user.id, req.params.stationId]);
  if (exists) {
    await db.run('DELETE FROM favorite_stations WHERE id = ?', [exists.id]);
    return ok(res, { is_favorite: false }, 'تمت إزالة المحطة من المفضلة');
  }
  await db.run('INSERT INTO favorite_stations (user_id, station_id) VALUES (?, ?)', [req.user.id, req.params.stationId]);
  return ok(res, { is_favorite: true }, 'تمت إضافة المحطة إلى المفضلة');
});

exports.listReviews = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all(`
    SELECT r.*, u.name AS user_name
    FROM station_reviews r JOIN users u ON u.id = r.user_id
    WHERE r.station_id = ? ORDER BY r.id DESC
  `, [req.params.stationId]);
  return ok(res, rows);
});

exports.createReview = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['rating']);
  if (missing.length) return fail(res, 'التقييم مطلوب');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 'التقييم يجب أن يكون من 1 إلى 5');
  const db = await getDb();
  const station = await db.get('SELECT id FROM stations WHERE id = ?', [req.params.stationId]);
  if (!station) return fail(res, 'المحطة غير موجودة', 404);
  const result = await db.run(
    'INSERT INTO station_reviews (user_id, station_id, rating, comment) VALUES (?, ?, ?, ?)',
    [req.user.id, req.params.stationId, rating, req.body.comment || null]
  );
  const review = await db.get('SELECT r.*, u.name AS user_name FROM station_reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?', [result.lastID]);
  return ok(res, review, 'تم إرسال التقييم', 201);
});

exports.createTicket = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['subject', 'message']);
  if (missing.length) return fail(res, 'الموضوع والرسالة مطلوبة');
  const db = await getDb();
  const result = await db.run('INSERT INTO support_tickets (user_id, subject, message) VALUES (?, ?, ?)', [req.user.id, req.body.subject, req.body.message]);
  const row = await db.get('SELECT * FROM support_tickets WHERE id = ?', [result.lastID]);
  return ok(res, row, 'تم إرسال تذكرة الدعم', 201);
});

exports.listTickets = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  return ok(res, rows);
});

exports.createReport = asyncHandler(async (req, res) => {
  const missing = required(req.body, ['report_type', 'description']);
  if (missing.length) return fail(res, 'نوع البلاغ والوصف مطلوبان');
  const db = await getDb();
  const result = await db.run(
    'INSERT INTO issue_reports (user_id, station_id, report_type, description) VALUES (?, ?, ?, ?)',
    [req.user.id, req.body.station_id || null, req.body.report_type, req.body.description]
  );
  const row = await db.get('SELECT * FROM issue_reports WHERE id = ?', [result.lastID]);
  return ok(res, row, 'تم إرسال البلاغ', 201);
});
