const router = require('express').Router();
const bookingController = require('../controllers/bookingController');
const { auth, allowRoles, canAccessStation } = require('../middleware/auth');

router.post('/', auth, bookingController.createBooking);
router.get('/my', auth, bookingController.myBookings);
router.get('/station/:stationId', auth, allowRoles('admin', 'station_manager', 'employee'), canAccessStation, bookingController.stationQueue);
router.patch('/:id/status', auth, bookingController.updateBookingStatus);
router.patch('/:id/cancel', auth, bookingController.cancelBooking);

module.exports = router;
