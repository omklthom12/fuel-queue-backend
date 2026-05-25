const router = require('express').Router();
const controller = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');

router.get('/', auth, controller.listNotifications);
router.patch('/:id/read', auth, controller.markRead);
router.patch('/read-all', auth, controller.markAllRead);

module.exports = router;
