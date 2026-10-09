const express = require('express');
const router = express.Router();
const c = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public route: Login
router.post('/login', c.login);

// Protected routes
router.get('/me', authenticate, c.getMe);
router.post('/logout', authenticate, c.logout);

module.exports = router;
