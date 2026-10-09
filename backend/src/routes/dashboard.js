const express = require('express');
const router = express.Router();
const c = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');

// All dashboard endpoints require authentication & role check
router.use(authenticate);

// Reconciliation endpoint (internal engineering/control endpoint, requires SALES_MANAGER or ADMIN)
router.get('/overview/reconciliation', authorize(['ADMIN', 'SALES_MANAGER']), c.getReconciliation);

// Sales Overview master endpoint
router.get('/overview', c.getDashboardOverview);

// Auxiliary dashboard routes
router.get('/salesperson-performance', c.getSalespersonPerformance);
router.get('/person-performance', c.getSalespersonPerformance);
router.get('/recent-activities', c.getRecentActivities);
router.get('/upcoming-followups', c.getUpcomingFollowUps);

module.exports = router;

