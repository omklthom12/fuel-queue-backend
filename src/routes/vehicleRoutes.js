const router = require('express').Router();
const controller = require('../controllers/vehicleController');
const { auth, allowRoles } = require('../middleware/auth');
router.use(auth, allowRoles('driver','admin'));
router.get('/', controller.listVehicles);
router.post('/', controller.createVehicle);
router.put('/:id', controller.updateVehicle);
router.delete('/:id', controller.deleteVehicle);
module.exports = router;
