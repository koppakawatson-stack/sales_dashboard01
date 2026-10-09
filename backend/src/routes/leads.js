const express = require('express');
const router = express.Router();
const c = require('../controllers/leadsController');
const { authenticate, authorize } = require('../middleware/auth');

// All lead routes require authentication
router.use(authenticate);

// ── Lead Analytics ──
router.get('/stats', c.getLeadStats);

// ── Lead CRUD & Lifecycle Operations ──
router.get('/', c.getLeads);
router.post('/', c.createLead);
router.get('/:id', c.getLead);
router.patch('/:id', c.updateLead);
router.put('/:id', c.updateLead); // Backward compatibility

// ── Lifecycle State Machine Transition ──
router.patch('/:id/status', c.changeLeadStatus);

// ── Salesperson Assignment Control (Admin/Manager only) ──
router.patch('/:id/assignment', authorize(['ADMIN', 'SALES_MANAGER']), c.assignLead);

// ── Lead Archival & Deletion ──
router.patch('/:id/archive', c.archiveLead);
router.delete('/:id', c.deleteLead);

// ── Lead Activities ──
router.get('/:id/activities', c.getLeadActivities);

module.exports = router;
