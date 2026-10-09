const express = require('express');
const router = express.Router();
const c = require('../controllers/customersController');
const { authenticate, authorize } = require('../middleware/auth');

// All customer routes require authentication
router.use(authenticate);

// ── Customer Analytics & Contract Stats ──
router.get('/stats', c.getCustomerStats);

// ── Customer CRUD & Listing ──
router.get('/', c.getCustomers);
router.post('/', c.createCustomer);
router.get('/:id', c.getCustomer);
router.patch('/:id', c.updateCustomer);
router.put('/:id', c.updateCustomer); // Backward compatibility

// ── Salesperson Assignment Control (Admin/Manager only) ──
router.patch('/:id/assignment', authorize(['ADMIN', 'SALES_MANAGER']), c.assignCustomer);

// ── Archival & Deletion ──
router.patch('/:id/archive', c.archiveCustomer);
router.delete('/:id', c.deleteCustomer);

// ── Activities ──
router.get('/:id/activities', c.getCustomerActivities);

module.exports = router;
