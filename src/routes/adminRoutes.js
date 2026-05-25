const router = require('express').Router();
const c = require('../controllers/adminController');
const { auth, allowRoles } = require('../middleware/auth');
router.use(auth, allowRoles('admin','station_manager'));

router.get('/users', c.listUsers);
router.post('/users', c.createUser);
router.put('/users/:id', c.updateUser);
router.delete('/users/:id', c.deleteUser);
router.delete('/stations/:id', c.deleteStation);

router.get('/bookings', c.listBookings);
router.delete('/bookings/:id', c.deleteBooking);

router.get('/pumps', c.listPumps);
router.post('/pumps', c.createPump);
router.put('/pumps/:id', c.updatePump);
router.delete('/pumps/:id', c.deletePump);

router.get('/fuel-types', c.listFuelTypes);
router.post('/fuel-types', c.createFuelType);
router.put('/fuel-types/:id', c.updateFuelType);
router.delete('/fuel-types/:id', c.deleteFuelType);

router.get('/tickets', c.listTickets);
router.patch('/tickets/:id', c.updateTicket);
router.delete('/tickets/:id', c.deleteTicket);

router.get('/issue-reports', c.listIssueReports);
router.patch('/issue-reports/:id', c.updateIssueReport);
router.delete('/issue-reports/:id', c.deleteIssueReport);

router.get('/reviews', c.listReviews);
router.delete('/reviews/:id', c.deleteReview);

module.exports = router;
