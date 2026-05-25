const router = require('express').Router();
const stationController = require('../controllers/stationController');
const { auth, allowRoles, canAccessStation } = require('../middleware/auth');

router.get('/fuel-types', stationController.listFuelTypes);
router.get('/', stationController.listStations);
router.get('/:id', stationController.getStation);
router.post('/', auth, allowRoles('admin'), stationController.createStation);
router.put('/:id', auth, allowRoles('admin', 'station_manager'), canAccessStation, stationController.updateStation);
router.put('/:stationId/fuel', auth, allowRoles('admin', 'station_manager', 'employee'), canAccessStation, stationController.updateFuel);

module.exports = router;
