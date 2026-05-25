const { getDb } = require('../database/db');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

exports.listNotifications = asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 100
  `, [req.user.id]);
  return ok(res, rows);
});

exports.markRead = asyncHandler(async (req, res) => {
  const db = await getDb();
  await db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  return ok(res, null, 'تم تعليم الإشعار كمقروء');
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const db = await getDb();
  await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  return ok(res, null, 'تم تعليم كل الإشعارات كمقروءة');
});
