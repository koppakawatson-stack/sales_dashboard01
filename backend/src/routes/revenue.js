const express = require('express');
const router = express.Router();
const c = require('../controllers/revenueController');

router.get('/', c.getRevenue);
router.get('/analytics', c.getRevenueAnalytics);
router.get('/summary', c.getRevenueAnalytics);
router.get('/trend', c.getRevenueTrend);
router.get('/by-salesperson', c.getRevenueBySalesperson);
router.get('/by-customer', c.getRevenueByCustomer);
router.get('/by-product', c.getRevenueByProduct);
router.post('/', c.createRevenue);
router.put('/:id', c.updateRevenue);
router.delete('/:id', c.deleteRevenue);

module.exports = router;
