const express = require('express');
const router = express.Router();
const { login, getProfile } = require('../controllers/authController');
const { validateLogin } = require('../middleware/validationMiddleware');
const { authenticateToken } = require('../middleware/authMiddleware');

// Public routes
router.post('/login', validateLogin, login);

// Protected routes
router.get('/profile', authenticateToken, getProfile);

module.exports = router;