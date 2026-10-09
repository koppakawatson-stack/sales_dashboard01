const express = require('express');
const router = express.Router();
const c = require('../controllers/activitiesController');
const { authenticate } = require('../middleware/auth');

// All sales activity routes require authentication
router.use(authenticate);

// ── Activity Stats ──
router.get('/stats', c.getActivityStats);

// ── CRUD Operations ──
router.get('/', c.getActivities);
router.post('/', c.createActivity);
router.get('/:id', c.getActivity);
router.patch('/:id', c.updateActivity);
router.put('/:id', c.updateActivity);
router.delete('/:id', c.deleteActivity);

module.exports = router;
