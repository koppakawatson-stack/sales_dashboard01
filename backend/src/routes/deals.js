const express = require('express');
const router = express.Router();
const c = require('../controllers/dealsController');
const { authenticate, authorize } = require('../middleware/auth');

// All Deal routes require authentication
router.use(authenticate);

// ── Deal Analytics & Pipeline Summary ──
router.get('/stats', c.getDealStats);
router.get('/pipeline/summary', c.getPipelineSummary);

// ── CRUD Operations ──
router.get('/', c.getDeals);
router.post('/', c.createDeal);
router.get('/:id', c.getDeal);
router.patch('/:id', c.updateDeal);
router.put('/:id', c.updateDeal); // Backward compatibility

// ── Stage Progression & Assignment Controls ──
router.patch('/:id/stage', c.changeDealStage);
router.patch('/:id/assignment', authorize(['ADMIN', 'SALES_MANAGER']), c.assignDeal);

// ── Deletion ──
router.delete('/:id', c.deleteDeal);

module.exports = router;
