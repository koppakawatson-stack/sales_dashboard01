const express = require('express');
const router = express.Router();
const c = require('../controllers/salespersonsController');

router.get('/', c.getSalespersons);
router.post('/', c.createSalesperson);
router.put('/:id', c.updateSalesperson);

router.get('/targets', c.getTargets);
router.post('/targets', c.createTarget);
router.put('/targets/:id', c.updateTarget);

module.exports = router;
