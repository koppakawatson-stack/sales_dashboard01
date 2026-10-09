/**
 * HARVIK TECHNOLOGIES — SALES ACTIVITY MANAGEMENT CONTROL LAYER
 * Track:
 * - Calls
 * - Meetings
 * - Emails
 * - Demos
 * - Follow-ups
 * - Proposals
 * - Other sales activities
 *
 * Each activity contains:
 * - Customer / Lead association
 * - Assigned Salesperson
 * - Activity Type
 * - Date
 * - Notes
 * - Next Action & Next Action Date
 * - Outcome & Status tracking
 *
 * Features:
 * - Pure validation layer integration
 * - Auto-increment business ID (ACT-00001)
 * - Salesperson role-based data isolation
 * - Optimistic locking concurrency control
 * - Audit logging (ACTIVITY_CREATED, ACTIVITY_UPDATED, ACTIVITY_DELETED)
 * - Redis 7 caching and automated invalidation
 */

const Activity = require('../models/Activity');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');
const { cacheGet, cacheSet, cacheDelPattern } = require('../config/redis');
const {
  validateActivity,
  ALLOWED_ACTIVITY_TYPES,
  ALLOWED_OUTCOMES,
  ALLOWED_STATUSES,
} = require('../utils/activityValidator');

/**
 * Helper to resolve activity by MongoDB _id or business activityId (e.g. ACT-00001).
 */
function findActivityByIdentifier(id) {
  if (!id) return null;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
  if (isObjectId) {
    return Activity.findOne({ _id: id, isDeleted: { $ne: true } });
  }
  return Activity.findOne({ activityId: id, isDeleted: { $ne: true } });
}

/**
 * Helper to check salesperson access control.
 */
function checkSalespersonAccess(user, activity) {
  if (!user) return true;
  const role = (user.systemRole || user.role || 'SALESPERSON').toUpperCase();
  if (role === 'ADMIN' || role === 'SALES_MANAGER') return true;
  if (role === 'SALESPERSON') {
    const assignedId = activity.salesperson?._id || activity.salesperson;
    if (!assignedId) return true;
    return String(assignedId) === String(user._id || user.id);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/v1/activities/stats — Sales Activity Portfolio & Type Breakdown
// ─────────────────────────────────────────────────────────────────────────────
exports.getActivityStats = async (req, res, next) => {
  try {
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    const isSalesperson = userRole === 'SALESPERSON';
    const userId = req.user?._id || req.user?.id;

    const cacheKey = `activities:stats:${isSalesperson ? userId : 'ALL'}`;
    const cached = await cacheGet(cacheKey);
    if (cached?.hit && cached.data) return res.json(cached.data);

    const match = { isDeleted: { $ne: true } };
    if (isSalesperson && userId) {
      match.salesperson = userId;
    }

    const typeAgg = await Activity.aggregate([
      { $match: match },
      { $group: { _id: '$activityType', count: { $sum: 1 } } },
    ]);

    // Build map to ensure all 7 types exist in stats
    const countsMap = {};
    ALLOWED_ACTIVITY_TYPES.forEach(t => {
      countsMap[t] = 0;
    });

    typeAgg.forEach(item => {
      if (item._id && countsMap[item._id] !== undefined) {
        countsMap[item._id] = item.count;
      }
    });

    // Return in array format expected by frontend: [{ _id: 'Call', count: 12 }, ...]
    const result = ALLOWED_ACTIVITY_TYPES.map(type => ({
      _id: type,
      count: countsMap[type],
    }));

    // Cache for 60 seconds
    await cacheSet(cacheKey, result, 60);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/v1/activities — Paginated List with Scoping, Filtering, Search
// ─────────────────────────────────────────────────────────────────────────────
exports.getActivities = async (req, res, next) => {
  try {
    const {
      activityType,
      status,
      outcome,
      salesperson,
      customer,
      lead,
      deal,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { isDeleted: { $ne: true } };

    // Salesperson data isolation
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    if (userRole === 'SALESPERSON') {
      filter.salesperson = req.user._id || req.user.id;
    } else if (salesperson) {
      filter.salesperson = salesperson;
    }

    if (activityType) filter.activityType = activityType;
    if (status) filter.status = status;
    if (outcome) filter.outcome = outcome;
    if (customer) filter.customer = customer;
    if (lead) filter.lead = lead;
    if (deal) filter.deal = deal;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { activityId: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
        { nextAction: { $regex: q, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const total = await Activity.countDocuments(filter);
    const activities = await Activity.find(filter)
      .populate('salesperson', 'name email role')
      .populate('customer', 'companyName industry customerId')
      .populate('lead', 'companyName contactPerson leadId')
      .populate('deal', 'opportunityName dealId stage dealValue')
      .sort({ date: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    return res.json({
      success: true,
      activities,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/v1/activities/:id — Retrieve Single Activity
// ─────────────────────────────────────────────────────────────────────────────
exports.getActivity = async (req, res, next) => {
  try {
    const activity = await findActivityByIdentifier(req.params.id)
      .populate('salesperson', 'name email role')
      .populate('customer', 'companyName industry customerId contactPersons')
      .populate('lead', 'companyName contactPerson leadId')
      .populate('deal', 'opportunityName dealId stage dealValue');

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: { code: 'ACTIVITY_NOT_FOUND', message: 'Activity record not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, activity)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this sales activity.' },
      });
    }

    return res.json(activity);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/v1/activities — Log a New Sales Activity
// ─────────────────────────────────────────────────────────────────────────────
exports.createActivity = async (req, res, next) => {
  try {
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    const isSalesperson = userRole === 'SALESPERSON';
    const actorId = req.user?._id || req.user?.id || 'admin-system-id';

    const payload = { ...req.body };

    // Auto-assign salesperson if user is a salesperson
    if (isSalesperson) {
      payload.salesperson = req.user._id || req.user.id;
    }

    // Pure validation
    const validation = validateActivity(payload);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.join('; '),
          details: validation.errors,
        },
      });
    }

    const { data } = validation;

    // Verify Customer or Lead existence
    if (data.customer) {
      const customerDoc = await Customer.findOne({ _id: data.customer, isDeleted: { $ne: true } });
      if (!customerDoc) {
        return res.status(400).json({
          success: false,
          error: { code: 'CUSTOMER_NOT_FOUND', message: 'Associated customer does not exist.' },
        });
      }
    }

    if (data.lead) {
      const leadDoc = await Lead.findOne({ _id: data.lead, isDeleted: { $ne: true } });
      if (!leadDoc) {
        return res.status(400).json({
          success: false,
          error: { code: 'LEAD_NOT_FOUND', message: 'Associated lead does not exist.' },
        });
      }
    }

    const activity = new Activity({
      ...data,
      version: 1,
      isDeleted: false,
    });

    await activity.save();

    // Populate for return
    await activity.populate('salesperson', 'name email');
    if (activity.customer) await activity.populate('customer', 'companyName');
    if (activity.lead) await activity.populate('lead', 'companyName contactPerson');
    if (activity.deal) await activity.populate('deal', 'opportunityName');

    // Audit Logging
    await AuditLog.create({
      actorId: String(actorId),
      action: 'ACTIVITY_CREATED',
      entityType: 'ACTIVITY',
      entityId: activity.activityId || String(activity._id),
      after: activity.toObject(),
    });

    // Invalidate caches
    await cacheDelPattern('activities:*');
    await cacheDelPattern('dashboard:*');

    return res.status(201).json(activity);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. PATCH / PUT /api/v1/activities/:id — Update Activity with Concurrency Control
// ─────────────────────────────────────────────────────────────────────────────
exports.updateActivity = async (req, res, next) => {
  try {
    const activity = await findActivityByIdentifier(req.params.id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: { code: 'ACTIVITY_NOT_FOUND', message: 'Activity record not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, activity)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to edit this sales activity.' },
      });
    }

    // Optimistic Concurrency Control
    if (req.body.version !== undefined && activity.version !== Number(req.body.version)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ACTIVITY_VERSION_CONFLICT',
          message: `Stale update rejected. Expected version ${activity.version}, received ${req.body.version}.`,
        },
      });
    }

    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    const actorId = req.user?._id || req.user?.id || 'admin-system-id';

    // Merge payload
    const merged = {
      activityType: req.body.activityType || activity.activityType,
      salesperson: userRole === 'SALESPERSON' ? activity.salesperson : (req.body.salesperson || activity.salesperson),
      customer: req.body.customer !== undefined ? req.body.customer : activity.customer,
      lead: req.body.lead !== undefined ? req.body.lead : activity.lead,
      deal: req.body.deal !== undefined ? req.body.deal : activity.deal,
      date: req.body.date !== undefined ? req.body.date : activity.date,
      duration: req.body.duration !== undefined ? req.body.duration : activity.duration,
      notes: req.body.notes !== undefined ? req.body.notes : activity.notes,
      nextAction: req.body.nextAction !== undefined ? req.body.nextAction : activity.nextAction,
      nextActionDate: req.body.nextActionDate !== undefined ? req.body.nextActionDate : activity.nextActionDate,
      outcome: req.body.outcome || activity.outcome,
      status: req.body.status || activity.status,
    };

    const validation = validateActivity(merged);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.join('; '),
          details: validation.errors,
        },
      });
    }

    const beforeSnapshot = activity.toObject();

    // Apply validated changes
    Object.assign(activity, validation.data);
    activity.version = (activity.version || 1) + 1;

    await activity.save();

    await activity.populate('salesperson', 'name email');
    if (activity.customer) await activity.populate('customer', 'companyName');
    if (activity.lead) await activity.populate('lead', 'companyName contactPerson');
    if (activity.deal) await activity.populate('deal', 'opportunityName');

    // Audit Log
    await AuditLog.create({
      actorId: String(actorId),
      action: 'ACTIVITY_UPDATED',
      entityType: 'ACTIVITY',
      entityId: activity.activityId || String(activity._id),
      before: beforeSnapshot,
      after: activity.toObject(),
    });

    // Invalidate caches
    await cacheDelPattern('activities:*');
    await cacheDelPattern('dashboard:*');

    return res.json(activity);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. DELETE /api/v1/activities/:id — Soft Delete Sales Activity
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteActivity = async (req, res, next) => {
  try {
    const activity = await findActivityByIdentifier(req.params.id);
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: { code: 'ACTIVITY_NOT_FOUND', message: 'Activity record not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, activity)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to delete this sales activity.' },
      });
    }

    const actorId = req.user?._id || req.user?.id || 'admin-system-id';
    const beforeSnapshot = activity.toObject();

    activity.isDeleted = true;
    await activity.save();

    // Audit Log
    await AuditLog.create({
      actorId: String(actorId),
      action: 'ACTIVITY_DELETED',
      entityType: 'ACTIVITY',
      entityId: activity.activityId || String(activity._id),
      before: beforeSnapshot,
    });

    // Invalidate caches
    await cacheDelPattern('activities:*');
    await cacheDelPattern('dashboard:*');

    return res.json({
      success: true,
      message: 'Activity deleted successfully',
      activityId: activity.activityId,
    });
  } catch (err) {
    next(err);
  }
};
