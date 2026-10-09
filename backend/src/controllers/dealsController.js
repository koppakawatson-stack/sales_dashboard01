/**
 * HARVIK TECHNOLOGIES — DEAL / OPPORTUNITY MANAGEMENT CONTROL LAYER
 * Enforces stage progression lifecycle:
 * Lead -> Qualified -> Proposal -> Negotiation -> Won / Lost
 * Role-based data isolation, optimistic locking, audit logging,
 * automated idempotent revenue booking upon Won, and pipeline analytics.
 */

const crypto = require('crypto');
const Deal = require('../models/Deal');
const Revenue = require('../models/Revenue');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');
const { cacheGet, cacheSet, invalidateDashboardCache, cacheDelPattern, cacheDel } = require('../config/redis');
const {
  validateDeal,
  canTransitionDealStage,
  calculateWeightedValue,
  ALLOWED_DEAL_STAGES,
  STAGE_DEFAULT_PROBABILITIES,
} = require('../utils/dealValidator');

/**
 * Helper to resolve deal by either MongoDB _id or business dealId (e.g. DEAL-00001).
 */
function findDealByIdentifier(id) {
  if (!id) return null;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
  if (isObjectId) {
    return Deal.findOne({ _id: id, isDeleted: false });
  }
  return Deal.findOne({ dealId: id, isDeleted: false });
}

/**
 * Helper to check salesperson access control (Requirement #19 for Opportunities).
 */
function checkSalespersonAccess(user, deal) {
  if (!user) return true;
  const role = (user.systemRole || user.role || 'SALESPERSON').toUpperCase();
  if (role === 'ADMIN' || role === 'SALES_MANAGER') return true;
  if (role === 'SALESPERSON') {
    const assignedId = deal.salesperson?._id || deal.salesperson;
    if (!assignedId) return true;
    return String(assignedId) === String(user._id || user.id);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/v1/deals/stats — Pipeline Portfolio & Win Rate Analytics
// ─────────────────────────────────────────────────────────────────────────────
exports.getDealStats = async (req, res, next) => {
  try {
    const filter = { isDeleted: false };

    // Salesperson data isolation
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    if (userRole === 'SALESPERSON') {
      filter.salesperson = req.user._id || req.user.id;
    }

    const deals = await Deal.find(filter).lean();

    const totalDeals = deals.length;
    let activeDeals = 0;
    let wonDeals = 0;
    let lostDeals = 0;
    let pipelineValue = 0;
    let weightedPipeline = 0;
    let wonRevenue = 0;

    const stageBreakdown = {
      Lead: { count: 0, value: 0 },
      Qualified: { count: 0, value: 0 },
      Proposal: { count: 0, value: 0 },
      Negotiation: { count: 0, value: 0 },
      Won: { count: 0, value: 0 },
      Lost: { count: 0, value: 0 },
    };

    deals.forEach(d => {
      const stage = d.stage || 'Lead';
      const val = Number(d.dealValue || 0);
      const wtVal = Number(d.weightedValue || 0);

      if (stageBreakdown[stage]) {
        stageBreakdown[stage].count++;
        stageBreakdown[stage].value += val;
      }

      if (stage === 'Won') {
        wonDeals++;
        wonRevenue += val;
      } else if (stage === 'Lost') {
        lostDeals++;
      } else {
        // Active pipeline
        activeDeals++;
        pipelineValue += val;
        weightedPipeline += wtVal;
      }
    });

    const closedDeals = wonDeals + lostDeals;
    const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
    const avgDealSize = totalDeals > 0
      ? Math.round((pipelineValue + wonRevenue) / totalDeals)
      : 0;

    res.json({
      success: true,
      data: {
        totalDeals,
        activeDeals,
        wonDeals,
        lostDeals,
        pipelineValue,
        weightedPipeline,
        wonRevenue,
        winRate,
        avgDealSize,
        stageBreakdown,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/v1/deals/pipeline/summary — Pipeline Grouped Stage Aggregation
// ─────────────────────────────────────────────────────────────────────────────
exports.getPipelineSummary = async (req, res, next) => {
  try {
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    const match = { isDeleted: false, stage: { $nin: ['Won', 'Lost'] } };

    if (userRole === 'SALESPERSON') {
      match.salesperson = req.user._id || req.user.id;
    }

    const cacheKey = `deals:pipeline:summary:${userRole}:${req.user?._id || 'all'}`;
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const pipeline = await Deal.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$stage',
          count: { $sum: 1 },
          totalValue: { $sum: '$dealValue' },
          weightedValue: { $sum: '$weightedValue' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    await cacheSet(cacheKey, pipeline, 60);
    res.json(pipeline);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/v1/deals — List Deals with Pagination, Search, Filter & Role Scoping
// ─────────────────────────────────────────────────────────────────────────────
exports.getDeals = async (req, res, next) => {
  try {
    const {
      stage,
      salesperson,
      customer,
      page = 1,
      limit = 20,
      search,
      sort = 'createdAt:desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = { isDeleted: false };

    // Role-based salesperson data isolation
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    if (userRole === 'SALESPERSON') {
      filter.salesperson = req.user._id || req.user.id;
    } else if (salesperson) {
      filter.salesperson = salesperson;
    }

    if (stage) filter.stage = stage;
    if (customer) filter.customer = customer;

    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$or = [
        { dealId: { $regex: term, $options: 'i' } },
        { opportunityName: { $regex: term, $options: 'i' } },
        { productService: { $regex: term, $options: 'i' } },
      ];
    }

    // Sort options
    const [sortField, sortDir] = sort.split(':');
    const sortOptions = {};
    sortOptions[sortField || 'createdAt'] = sortDir === 'asc' ? 1 : -1;

    // Cache lookup
    const filterHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ filter, sortOptions, pageNum, limitNum, userId: req.user?._id }))
      .digest('hex')
      .slice(0, 16);
    const cacheKey = `deals:list:${filterHash}`;

    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) {
      return res.json(cached.data);
    }

    const [total, deals] = await Promise.all([
      Deal.countDocuments(filter),
      Deal.find(filter)
        .populate('salesperson', 'name email role')
        .populate('customer', 'customerId companyName email phone industry address')
        .populate('lead', 'leadId companyName contactPerson')
        .sort(sortOptions)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    const response = {
      success: true,
      data: {
        deals,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
      // Backward compatibility keys:
      deals,
      total,
      page: pageNum,
      pages: totalPages,
    };

    await cacheSet(cacheKey, response, 60);
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/v1/deals/:id — Fetch Single Deal by Mongo _id or dealId
// ─────────────────────────────────────────────────────────────────────────────
exports.getDeal = async (req, res, next) => {
  try {
    const deal = await findDealByIdentifier(req.params.id)
      .populate('salesperson', 'name email phone role')
      .populate('customer', 'customerId companyName email phone industry address')
      .populate('lead', 'leadId companyName contactPerson');

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { code: 'DEAL_NOT_FOUND', message: 'Deal not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, deal)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: opportunity belongs to another salesperson.' },
      });
    }

    res.json({
      success: true,
      data: deal,
      ...deal.toObject(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/v1/deals — Create Deal / Opportunity
// ─────────────────────────────────────────────────────────────────────────────
exports.createDeal = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const validation = validateDeal(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.join(' '),
          details: validation.errors,
        },
      });
    }

    const payload = validation.data;

    // Role scoping: salesperson creating deal is automatically assigned
    if (req.user?.role === 'SALESPERSON') {
      payload.salesperson = req.user._id;
    }

    const deal = new Deal(payload);
    await deal.save();

    // Audit Log Entry
    await AuditLog.create({
      actorId: String(actorId),
      action: 'OPPORTUNITY_CREATED',
      entityType: 'OPPORTUNITY',
      entityId: deal.dealId || String(deal._id),
      after: {
        opportunityName: deal.opportunityName,
        stage: deal.stage,
        dealValue: deal.dealValue,
        salesperson: deal.salesperson,
        customer: deal.customer,
      },
    });

    // Invalidate caches
    await cacheDelPattern('deals:*');
    await invalidateDashboardCache();

    const populated = await Deal.findById(deal._id)
      .populate('salesperson', 'name email role')
      .populate('customer', 'customerId companyName email');

    res.status(201).json({
      success: true,
      data: populated,
      ...populated.toObject(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. PATCH/PUT /api/v1/deals/:id — Update Deal with Stage State Machine & Concurrency Control
// ─────────────────────────────────────────────────────────────────────────────
exports.updateDeal = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const deal = await findDealByIdentifier(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { code: 'DEAL_NOT_FOUND', message: 'Deal not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, deal)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: opportunity belongs to another salesperson.' },
      });
    }

    // Optimistic Concurrency Control (Version Conflict Check)
    if (req.body.version !== undefined && Number(req.body.version) !== deal.version) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DEAL_VERSION_CONFLICT',
          message: 'The opportunity was modified by another user. Refresh and try again.',
        },
      });
    }

    const previousStage = deal.stage;
    const requestedStage = req.body.stage;
    const beforeState = deal.toObject();

    // Stage State Machine Enforcement
    if (requestedStage && requestedStage !== previousStage) {
      if (!canTransitionDealStage(previousStage, requestedStage)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STAGE_TRANSITION',
            message: `Stage transition from ${previousStage} to ${requestedStage} is not allowed. Lifecycle: Lead -> Qualified -> Proposal -> Negotiation -> Won / Lost.`,
          },
        });
      }

      if (requestedStage === 'Lost' && (!req.body.lostReason || !String(req.body.lostReason).trim())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Lost reason is mandatory when transitioning deal to Lost.',
          },
        });
      }
    }

    // Validate merged payload
    const merged = { ...deal.toObject(), ...req.body };
    const validation = validateDeal(merged);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: validation.errors.join(' ') },
      });
    }

    const updates = validation.data;
    delete updates.dealId; // Immutable
    delete updates._id;

    // Salesperson cannot change assignment via general update
    if (req.user?.role === 'SALESPERSON') {
      delete updates.salesperson;
    }

    Object.assign(deal, updates);
    deal.version = (deal.version || 1) + 1;

    // Automated Actions on Won
    if (requestedStage === 'Won' && previousStage !== 'Won') {
      deal.wonAt = req.body.actualClosingDate ? new Date(req.body.actualClosingDate) : new Date();
      deal.actualClosingDate = deal.wonAt;
      deal.probability = 100;
      deal.weightedValue = deal.dealValue;

      // Idempotent Revenue Booking & Customer Revenue Sync
      const existingRevenue = await Revenue.findOne({ deal: deal._id });
      if (!existingRevenue && deal.customer) {
        const revenueRecord = new Revenue({
          deal: deal._id,
          customer: deal.customer,
          salesperson: deal.salesperson,
          amount: deal.dealValue,
          productService: deal.productService,
          date: deal.wonAt,
          recognizedAt: deal.wonAt,
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          status: 'Paid',
          paymentStatus: 'Paid',
          source: 'OPPORTUNITY_WON',
        });
        await revenueRecord.save();

        // Increment customer total revenue
        await Customer.findByIdAndUpdate(deal.customer, {
          $inc: { totalRevenue: deal.dealValue },
        });

        await AuditLog.create({
          actorId: String(actorId),
          action: 'REVENUE_RECORDED',
          entityType: 'REVENUE',
          entityId: revenueRecord.revenueId || String(revenueRecord._id),
          after: revenueRecord.toObject(),
        });
      }

      await AuditLog.create({
        actorId: String(actorId),
        action: 'OPPORTUNITY_WON',
        entityType: 'OPPORTUNITY',
        entityId: deal.dealId,
        before: beforeState,
        after: deal.toObject(),
      });
    } else if (requestedStage === 'Lost' && previousStage !== 'Lost') {
      deal.lostAt = new Date();
      deal.probability = 0;
      deal.weightedValue = 0;
      deal.lostReason = req.body.lostReason;

      await AuditLog.create({
        actorId: String(actorId),
        action: 'OPPORTUNITY_LOST',
        entityType: 'OPPORTUNITY',
        entityId: deal.dealId,
        before: beforeState,
        after: deal.toObject(),
      });
    } else if (requestedStage && requestedStage !== previousStage) {
      await AuditLog.create({
        actorId: String(actorId),
        action: 'OPPORTUNITY_STAGE_CHANGED',
        entityType: 'OPPORTUNITY',
        entityId: deal.dealId,
        before: { stage: previousStage },
        after: { stage: requestedStage },
      });
    } else {
      await AuditLog.create({
        actorId: String(actorId),
        action: 'OPPORTUNITY_UPDATED',
        entityType: 'OPPORTUNITY',
        entityId: deal.dealId,
        before: { dealValue: beforeState.dealValue, probability: beforeState.probability },
        after: { dealValue: deal.dealValue, probability: deal.probability },
      });
    }

    await deal.save();

    await cacheDelPattern('deals:*');
    await invalidateDashboardCache();

    const populated = await Deal.findById(deal._id)
      .populate('salesperson', 'name email role')
      .populate('customer', 'customerId companyName email phone industry address')
      .populate('lead', 'leadId companyName contactPerson');

    res.json({
      success: true,
      data: populated,
      ...populated.toObject(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. PATCH /api/v1/deals/:id/stage — Lifecycle Stage Progression
// ─────────────────────────────────────────────────────────────────────────────
exports.changeDealStage = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const { stage, lostReason, actualClosingDate } = req.body;
    if (!stage) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATA', message: 'Target stage is required.' },
      });
    }

    const deal = await findDealByIdentifier(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { code: 'DEAL_NOT_FOUND', message: 'Deal not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, deal)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: opportunity belongs to another salesperson.' },
      });
    }

    if (!canTransitionDealStage(deal.stage, stage)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STAGE_TRANSITION',
          message: `Cannot transition deal from ${deal.stage} to ${stage}. Lifecycle: Lead -> Qualified -> Proposal -> Negotiation -> Won / Lost.`,
        },
      });
    }

    if (stage === 'Lost' && (!lostReason || !String(lostReason).trim())) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Lost reason is required when marking an opportunity as Lost.' },
      });
    }

    const previousStage = deal.stage;
    deal.stage = stage;
    deal.version = (deal.version || 1) + 1;

    if (stage === 'Won') {
      deal.wonAt = actualClosingDate ? new Date(actualClosingDate) : new Date();
      deal.actualClosingDate = deal.wonAt;
      deal.probability = 100;
      deal.weightedValue = deal.dealValue;

      // Idempotent revenue creation
      const existingRevenue = await Revenue.findOne({ deal: deal._id });
      if (!existingRevenue && deal.customer) {
        const revenueRecord = new Revenue({
          deal: deal._id,
          customer: deal.customer,
          salesperson: deal.salesperson,
          amount: deal.dealValue,
          productService: deal.productService,
          date: deal.wonAt,
          recognizedAt: deal.wonAt,
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          status: 'Paid',
          paymentStatus: 'Paid',
          source: 'OPPORTUNITY_WON',
        });
        await revenueRecord.save();

        await Customer.findByIdAndUpdate(deal.customer, {
          $inc: { totalRevenue: deal.dealValue },
        });

        await AuditLog.create({
          actorId: String(actorId),
          action: 'REVENUE_RECORDED',
          entityType: 'REVENUE',
          entityId: revenueRecord.revenueId || String(revenueRecord._id),
          after: revenueRecord.toObject(),
        });
      }

      await AuditLog.create({
        actorId: String(actorId),
        action: 'OPPORTUNITY_WON',
        entityType: 'OPPORTUNITY',
        entityId: deal.dealId,
        before: { stage: previousStage },
        after: { stage: 'Won' },
      });
    } else if (stage === 'Lost') {
      deal.lostAt = new Date();
      deal.probability = 0;
      deal.weightedValue = 0;
      deal.lostReason = lostReason;

      await AuditLog.create({
        actorId: String(actorId),
        action: 'OPPORTUNITY_LOST',
        entityType: 'OPPORTUNITY',
        entityId: deal.dealId,
        before: { stage: previousStage },
        after: { stage: 'Lost', lostReason },
      });
    } else {
      deal.probability = STAGE_DEFAULT_PROBABILITIES[stage] ?? deal.probability;
      deal.weightedValue = calculateWeightedValue(deal.dealValue, deal.probability);

      await AuditLog.create({
        actorId: String(actorId),
        action: 'OPPORTUNITY_STAGE_CHANGED',
        entityType: 'OPPORTUNITY',
        entityId: deal.dealId,
        before: { stage: previousStage },
        after: { stage },
      });
    }

    await deal.save();

    await cacheDelPattern('deals:*');
    await invalidateDashboardCache();

    const populated = await Deal.findById(deal._id)
      .populate('salesperson', 'name email role')
      .populate('customer', 'customerId companyName email phone industry address')
      .populate('lead', 'leadId companyName contactPerson');

    res.json({
      success: true,
      data: populated,
      message: `Deal progressed to ${stage}.`,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. PATCH /api/v1/deals/:id/assignment — Reassign Salesperson (Admin/Manager only)
// ─────────────────────────────────────────────────────────────────────────────
exports.assignDeal = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const { salespersonId, reason } = req.body;
    if (!salespersonId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATA', message: 'Target salespersonId is required.' },
      });
    }

    const deal = await findDealByIdentifier(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { code: 'DEAL_NOT_FOUND', message: 'Deal not found.' },
      });
    }

    const previousSalesperson = deal.salesperson;
    deal.salesperson = salespersonId;
    deal.version = (deal.version || 1) + 1;
    await deal.save();

    await AuditLog.create({
      actorId: String(actorId),
      action: 'OPPORTUNITY_REASSIGNED',
      entityType: 'OPPORTUNITY',
      entityId: deal.dealId,
      before: { salesperson: previousSalesperson },
      after: { salesperson: salespersonId, reason: reason || 'Territory reassignment' },
    });

    await cacheDelPattern('deals:*');
    await invalidateDashboardCache();

    const populated = await Deal.findById(deal._id)
      .populate('salesperson', 'name email role')
      .populate('customer', 'customerId companyName email');

    res.json({
      success: true,
      data: populated,
      message: 'Deal reassigned successfully.',
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. DELETE /api/v1/deals/:id — Soft Delete Deal
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteDeal = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const deal = await findDealByIdentifier(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { code: 'DEAL_NOT_FOUND', message: 'Deal not found.' },
      });
    }

    deal.isDeleted = true;
    await deal.save();

    await AuditLog.create({
      actorId: String(actorId),
      action: 'OPPORTUNITY_DELETED',
      entityType: 'OPPORTUNITY',
      entityId: deal.dealId,
    });

    await cacheDelPattern('deals:*');
    await invalidateDashboardCache();

    res.json({
      success: true,
      message: 'Deal deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
};
