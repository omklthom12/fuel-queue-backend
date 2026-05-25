const router = require('express').Router();
const controller = require('../controllers/dashboardController');
const { auth, allowRoles } = require('../middleware/auth');

router.get('/overview', auth, allowRoles('admin', 'station_manager', 'employee'), controller.overview);
router.get('/reports', auth, allowRoles('admin', 'station_manager'), controller.reports);

module.exports = router;
