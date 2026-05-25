const router = require('express').Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', auth, authController.me);
router.put('/me', auth, authController.updateProfile);
router.patch('/change-password', auth, authController.changePassword);

module.exports = router;
