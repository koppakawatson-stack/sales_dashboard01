const Salesperson = require('../models/Salesperson');
const Target = require('../models/Target');
const { recordAudit } = require('../services/auditService');
const { cacheGet, cacheSet, cacheDelPattern, invalidateDashboardCache } = require('../config/redis');

exports.getSalespersons = async (req, res, next) => {
  try {
    const cacheKey = 'salespersons:all';
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);
    const salespersons = await Salesperson.find({ isActive: true }).select('-password').sort({ name: 1 });
    await cacheSet(cacheKey, salespersons, 300);
    res.json(salespersons);
  } catch (err) {
    next(err);
  }
};

exports.createSalesperson = async (req, res, next) => {
  try {
    const sp = new Salesperson(req.body);
    await sp.save();
    await recordAudit({
      actorId: req.user?._id || 'SYSTEM',
      action: 'USER_ASSIGNED',
      entityType: 'USER',
      entityId: sp._id,
      after: sp.toObject(),
    });
    await cacheDelPattern('salespersons:*');
    await invalidateDashboardCache();
    res.status(201).json(sp);
  } catch (err) {
    next(err);
  }
};

exports.updateSalesperson = async (req, res, next) => {
  try {
    const sp = await Salesperson.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!sp) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Salesperson not found' } });
    await cacheDelPattern('salespersons:*');
    await invalidateDashboardCache();
    res.json(sp);
  } catch (err) {
    next(err);
  }
};

exports.getTargets = async (req, res, next) => {
  try {
    const { salesperson, period, year } = req.query;
    const filter = {};
    if (salesperson) filter.salesperson = salesperson === 'company' ? null : salesperson;
    if (period) filter.period = period;
    if (year) filter.year = Number(year);
    const targets = await Target.find(filter).populate('salesperson', 'name email');
    res.json(targets);
  } catch (err) {
    next(err);
  }
};

exports.createTarget = async (req, res, next) => {
  try {
    const target = new Target(req.body);
    await target.save();
    await recordAudit({
      actorId: req.user?._id || 'SYSTEM',
      action: 'TARGET_CREATED',
      entityType: 'TARGET',
      entityId: target._id,
      after: target.toObject(),
    });
    await invalidateDashboardCache();
    res.status(201).json(target);
  } catch (err) {
    next(err);
  }
};

exports.updateTarget = async (req, res, next) => {
  try {
    const target = await Target.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Target not found' } });
    await recordAudit({
      actorId: req.user?._id || 'SYSTEM',
      action: 'TARGET_UPDATED',
      entityType: 'TARGET',
      entityId: target._id,
      after: target.toObject(),
    });
    await invalidateDashboardCache();
    res.json(target);
  } catch (err) {
    next(err);
  }
};
