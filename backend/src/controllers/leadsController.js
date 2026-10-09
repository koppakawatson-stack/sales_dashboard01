const mongoose = require('mongoose');
const crypto = require('crypto');
const Lead = require('../models/Lead');
const Salesperson = require('../models/Salesperson');
const Activity = require('../models/Activity');
const Deal = require('../models/Deal');
const Customer = require('../models/Customer');
const Revenue = require('../models/Revenue');
const { recordAudit } = require('../services/auditService');
const eventBus = require('../services/eventBus');
const { enqueueFollowUpJob } = require('../jobs/followUpQueue');
const { calculateLeadQualityScore } = require('../services/leadScoringService');
const {
  validateLead,
  isFollowUpOverdue,
  normalizeLeadStatus,
  ALLOWED_LOSS_REASONS,
} = require('../utils/leadValidator');
const {
  validateStatusTransition,
} = require('../services/leadStateMachine');
const {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  invalidateDashboardCache,
} = require('../config/redis');

/**
 * Cache invalidation helper
 */
async function invalidateLeadCaches(leadId) {
  try {
    const promises = [
      cacheDelPattern('leads:*'),
      cacheDelPattern('cache:leads:*'),
      cacheDelPattern('cache:lead:stats:*'),
      invalidateDashboardCache(),
    ];
    if (leadId) {
      promises.push(cacheDel(`cache:lead:${leadId}`));
    }
    await Promise.all(promises);
  } catch (err) {
    console.warn('⚠️  Redis cache invalidation non-fatal warning:', err.message);
  }
}

/**
 * Helper to escape regex special characters
 */
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Resolve Lead by either MongoDB _id or business leadId ('LEAD-XXXXXX')
 */
function findLeadByIdentifier(identifier, filter = {}) {
  const query = { ...filter, isDeleted: false };
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    query.$or = [{ _id: identifier }, { leadId: identifier }];
  } else {
    query.leadId = identifier;
  }
  return Lead.findOne(query);
}

/**
 * Check salesperson data isolation permission (Requirement #19)
 */
function checkSalespersonAccess(reqUser, lead) {
  if (!reqUser) return true;
  const role = (reqUser.systemRole || 'SALESPERSON').toUpperCase();
  if (role === 'ADMIN' || role === 'SALES_MANAGER') return true;

  // Salesperson role can only access their assigned leads
  const userId = String(reqUser._id || reqUser.id);
  const assignedId = lead.assignedSalesperson ? String(lead.assignedSalesperson._id || lead.assignedSalesperson) : null;
  return assignedId === userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/v1/leads — List leads with filters, search, and pagination
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeads = async (req, res, next) => {
  try {
    const {
      search,
      status,
      source,
      industry,
      salesperson,
      salespersonId,
      location,
      minExpectedValue,
      maxExpectedValue,
      createdFrom,
      createdTo,
      followUpFrom,
      followUpTo,
      sort = 'createdAt:desc',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // Role-based salesperson isolation scoping (Requirement #19)
    const filter = { isDeleted: false, isArchived: false };
    const userRole = (req.user?.systemRole || 'ADMIN').toUpperCase();
    if (userRole === 'SALESPERSON') {
      filter.assignedSalesperson = req.user._id;
    } else {
      const sp = salespersonId || salesperson;
      if (sp && mongoose.Types.ObjectId.isValid(sp)) {
        filter.assignedSalesperson = sp;
      }
    }

    // Filter by status (case-insensitive normalized)
    if (status) {
      const normStatus = normalizeLeadStatus(status);
      filter.status = normStatus;
    }

    // Filter by source
    if (source) {
      filter.source = { $regex: new RegExp(`^${escapeRegex(source)}$`, 'i') };
    }

    // Filter by industry
    if (industry) {
      filter.industry = { $regex: new RegExp(`^${escapeRegex(industry)}$`, 'i') };
    }

    // Filter by location
    if (location) {
      filter.$or = [
        { 'location.city': { $regex: escapeRegex(location), $options: 'i' } },
        { 'location.country': { $regex: escapeRegex(location), $options: 'i' } },
      ];
    }

    // Filter by expected value range
    if (minExpectedValue !== undefined || maxExpectedValue !== undefined) {
      filter.expectedValue = {};
      if (minExpectedValue !== undefined) filter.expectedValue.$gte = Number(minExpectedValue);
      if (maxExpectedValue !== undefined) filter.expectedValue.$lte = Number(maxExpectedValue);
    }

    // Filter by creation date range
    if (createdFrom || createdTo) {
      filter.createdAt = {};
      if (createdFrom) filter.createdAt.$gte = new Date(createdFrom);
      if (createdTo) filter.createdAt.$lte = new Date(createdTo);
    }

    // Filter by follow-up date range
    if (followUpFrom || followUpTo) {
      filter.nextFollowUpAt = {};
      if (followUpFrom) filter.nextFollowUpAt.$gte = new Date(followUpFrom);
      if (followUpTo) filter.nextFollowUpAt.$lte = new Date(followUpTo);
    }

    // Search by leadId, companyName, contactPerson, email, phone (Requirement #17)
    if (search && search.trim()) {
      const s = search.trim();
      const searchRegex = { $regex: escapeRegex(s), $options: 'i' };
      const searchConditions = [
        { leadId: searchRegex },
        { companyName: searchRegex },
        { contactPerson: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    // Parse sort parameter
    const [sortField, sortDir] = sort.split(':');
    const sortOptions = {};
    sortOptions[sortField || 'createdAt'] = sortDir === 'asc' ? 1 : -1;

    // Cache key generation
    const filterHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ filter, sortOptions, pageNum, limitNum, userId: req.user?._id }))
      .digest('hex')
      .slice(0, 16);
    const cacheKey = `cache:leads:list:${filterHash}`;

    // Redis cache lookup
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) {
      return res.json(cached.data);
    }

    // Query MongoDB
    const [total, leads] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter)
        .populate('assignedSalesperson', 'name email phone role')
        .sort(sortOptions)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    const response = {
      success: true,
      data: {
        leads,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
      // Backward compatibility keys for existing frontend components:
      leads,
      total,
      page: pageNum,
      pages: totalPages,
    };

    // Store in Redis (TTL: 60s)
    await cacheSet(cacheKey, response, 60);

    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/v1/leads/stats — Lead metrics and conversion analytics (Req #28, #29)
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeadStats = async (req, res, next) => {
  try {
    const userRole = (req.user?.systemRole || 'ADMIN').toUpperCase();
    const filter = { isDeleted: false, isArchived: false };
    if (userRole === 'SALESPERSON') {
      filter.assignedSalesperson = req.user._id;
    } else if (req.query.salespersonId && mongoose.Types.ObjectId.isValid(req.query.salespersonId)) {
      filter.assignedSalesperson = req.query.salespersonId;
    }

    const cacheKey = `cache:lead:stats:${req.user?._id || 'global'}:${req.query.salespersonId || 'all'}`;
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const now = new Date();

    const [
      totalLeads,
      newLeads,
      contactedLeads,
      qualifiedLeads,
      proposalLeads,
      negotiationLeads,
      wonLeads,
      lostLeads,
      overdueFollowUps,
      valueAgg,
    ] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.countDocuments({ ...filter, status: 'NEW' }),
      Lead.countDocuments({ ...filter, status: 'CONTACTED' }),
      Lead.countDocuments({ ...filter, status: 'QUALIFIED' }),
      Lead.countDocuments({ ...filter, status: 'PROPOSAL' }),
      Lead.countDocuments({ ...filter, status: 'NEGOTIATION' }),
      Lead.countDocuments({ ...filter, status: 'WON' }),
      Lead.countDocuments({ ...filter, status: 'LOST' }),
      Lead.countDocuments({
        ...filter,
        status: { $nin: ['WON', 'LOST'] },
        nextFollowUpAt: { $lt: now, $ne: null },
      }),
      Lead.aggregate([
        { $match: filter },
        { $group: { _id: null, totalValue: { $sum: '$expectedValue' }, avgValue: { $avg: '$expectedValue' } } },
      ]),
    ]);

    const averageExpectedValue = Math.round(valueAgg[0]?.avgValue || 0);
    const totalExpectedValue = valueAgg[0]?.totalValue || 0;
    const conversionRate = qualifiedLeads > 0 ? Number(((wonLeads / qualifiedLeads) * 100).toFixed(1)) : 0;

    const stats = {
      success: true,
      data: {
        totalLeads,
        newLeads,
        contactedLeads,
        qualifiedLeads,
        proposalLeads,
        negotiationLeads,
        wonLeads,
        lostLeads,
        overdueFollowUps,
        averageExpectedValue,
        totalExpectedValue,
        conversionRate,
        pipelineFunnel: {
          NEW: newLeads,
          CONTACTED: contactedLeads,
          QUALIFIED: qualifiedLeads,
          PROPOSAL: proposalLeads,
          NEGOTIATION: negotiationLeads,
          WON: wonLeads,
          LOST: lostLeads,
        },
      },
    };

    await cacheSet(cacheKey, stats, 60);
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/v1/leads/:id — Get single lead details
// ─────────────────────────────────────────────────────────────────────────────
exports.getLead = async (req, res, next) => {
  try {
    const lead = await findLeadByIdentifier(req.params.id)
      .populate('assignedSalesperson', 'name email phone role')
      .populate('convertedToCustomer', 'companyName customerId')
      .populate('convertedToDeal', 'opportunityName dealId dealValue stage');

    if (!lead || lead.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'LEAD_NOT_FOUND', message: 'Lead not found or has been archived.' },
      });
    }

    // Role-based salesperson access check
    if (!checkSalespersonAccess(req.user, lead)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: you may only access leads assigned to you.' },
      });
    }

    res.json({
      success: true,
      data: lead,
      ...lead.toObject(), // Backward compatibility
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/v1/leads — Create new lead with duplicate check and validation
// ─────────────────────────────────────────────────────────────────────────────
exports.createLead = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';
  const requestId = req.headers['x-request-id'] || null;

  try {
    // 1. Validate Input Data (Requirement #4)
    const validation = validateLead(req.body, false);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.map(e => e.message).join(' '),
          details: validation.errors,
        },
      });
    }

    const payload = validation.normalized;

    // 2. Duplicate Detection (Requirement #5)
    const overrideDuplicate = req.body.allowDuplicate === true ||
                              req.body.overrideDuplicateWarning === true ||
                              req.headers['x-override-duplicate'] === 'true';

    if (!overrideDuplicate) {
      const duplicateConditions = [];

      if (payload.email) {
        duplicateConditions.push({ email: payload.email });
      }
      if (payload.phone) {
        duplicateConditions.push({ phone: payload.phone });
      }
      if (payload.companyName && payload.contactPerson) {
        duplicateConditions.push({
          companyName: new RegExp(`^${escapeRegex(payload.companyName)}$`, 'i'),
          contactPerson: new RegExp(`^${escapeRegex(payload.contactPerson)}$`, 'i'),
        });
      }

      if (duplicateConditions.length > 0) {
        const existingLead = await Lead.findOne({
          isDeleted: false,
          isArchived: false,
          $or: duplicateConditions,
        });

        if (existingLead) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'POSSIBLE_DUPLICATE_LEAD',
              message: 'A similar lead already exists.',
            },
            data: {
              existingLeadId: existingLead.leadId,
              existingCompany: existingLead.companyName,
              existingContact: existingLead.contactPerson,
            },
          });
        }
      }
    }

    // 3. Compute Quality Score (Requirement #22)
    const scoreResult = calculateLeadQualityScore(payload);
    payload.leadQualityScore = scoreResult.score;
    payload.scoreVersion = scoreResult.scoreVersion;
    payload.scoreGeneratedAt = scoreResult.generatedAt;
    payload.scoreFactors = scoreResult.factors;

    // 4. Set Metadata
    payload.createdBy = String(actorId);
    payload.updatedBy = String(actorId);
    payload.version = 1;

    // 5. Atomic Creation
    const lead = new Lead(payload);
    await lead.save();

    // 6. Record Audit Log (Requirement #25)
    await recordAudit({
      actorId,
      action: 'LEAD_CREATED',
      entityType: 'LEAD',
      entityId: lead.leadId,
      after: lead.toObject(),
      requestId,
      ip: req.ip,
    });

    // 7. Publish Domain Event (Requirement #24)
    eventBus.publish('LeadCreated', {
      entityType: 'Lead',
      entityId: lead.leadId,
      actorId,
      metadata: { status: lead.status, expectedValue: lead.expectedValue },
    });

    // 8. Invalidate Redis Caches (Requirement #23)
    await invalidateLeadCaches(lead.leadId);

    // 9. Asynchronously Queue Follow-Up Job (Requirement #21)
    if (lead.nextFollowUpAt) {
      enqueueFollowUpJob(lead, 'INITIAL_FOLLOW_UP_SCHEDULED');
    }

    const populated = await Lead.findById(lead._id).populate('assignedSalesperson', 'name email phone role');

    res.status(201).json({
      success: true,
      data: populated,
      ...populated.toObject(), // Backward compatibility
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'POSSIBLE_DUPLICATE_LEAD',
          message: 'A lead with this unique identifier already exists.',
        },
      });
    }
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. PATCH / PUT /api/v1/leads/:id — Update lead details with optimistic concurrency
// ─────────────────────────────────────────────────────────────────────────────
exports.updateLead = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';
  const requestId = req.headers['x-request-id'] || null;

  try {
    const lead = await findLeadByIdentifier(req.params.id);
    if (!lead || lead.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'LEAD_NOT_FOUND', message: 'Lead not found or has been archived.' },
      });
    }

    // Role-based salesperson access check
    if (!checkSalespersonAccess(req.user, lead)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: you may only modify leads assigned to you.' },
      });
    }

    // Concurrency Control: Check version conflict (Requirement #26)
    if (req.body.version !== undefined && Number(req.body.version) !== lead.version) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'LEAD_VERSION_CONFLICT',
          message: 'The lead was modified by another user. Refresh and try again.',
        },
      });
    }

    // Validate update fields (Requirement #4)
    const validation = validateLead(req.body, true);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.map(e => e.message).join(' '),
          details: validation.errors,
        },
      });
    }

    const beforeState = lead.toObject();
    const updatePayload = validation.normalized;

    // Disallow arbitrary status modification through generic update endpoint (must use /status endpoint)
    delete updatePayload.status;

    // Disallow salesperson reassignment through generic update endpoint if not manager/admin
    const userRole = (req.user?.systemRole || 'ADMIN').toUpperCase();
    if (updatePayload.assignedSalesperson && userRole === 'SALESPERSON') {
      delete updatePayload.assignedSalesperson;
    }

    // Apply updates
    Object.assign(lead, updatePayload);
    lead.updatedBy = String(actorId);
    lead.version = (lead.version || 1) + 1;

    // Recalculate advisory quality score
    const scoreResult = calculateLeadQualityScore(lead);
    lead.leadQualityScore = scoreResult.score;
    lead.scoreVersion = scoreResult.scoreVersion;
    lead.scoreGeneratedAt = scoreResult.generatedAt;
    lead.scoreFactors = scoreResult.factors;

    await lead.save();

    // Record Audit
    await recordAudit({
      actorId,
      action: 'LEAD_UPDATED',
      entityType: 'LEAD',
      entityId: lead.leadId,
      before: beforeState,
      after: lead.toObject(),
      requestId,
      ip: req.ip,
    });

    // Publish Domain Event
    eventBus.publish('LeadUpdated', {
      entityType: 'Lead',
      entityId: lead.leadId,
      actorId,
      metadata: { changes: Object.keys(updatePayload) },
    });

    // Invalidate Cache
    await invalidateLeadCaches(lead.leadId);

    const populated = await Lead.findById(lead._id).populate('assignedSalesperson', 'name email phone role');

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
// 6. PATCH /api/v1/leads/:id/status — State Machine Controlled Transition (Req #6-#14)
// ─────────────────────────────────────────────────────────────────────────────
exports.changeLeadStatus = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';
  const requestId = req.headers['x-request-id'] || null;

  try {
    const { status: requestedStatus, reason } = req.body;
    const transitionData = { ...req.body, ...(req.body.data || {}) };

    if (!requestedStatus) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_LEAD_DATA', message: 'Target status is required.' },
      });
    }

    const lead = await findLeadByIdentifier(req.params.id);
    if (!lead || lead.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'LEAD_NOT_FOUND', message: 'Lead not found or has been archived.' },
      });
    }

    // Role-based salesperson access check
    if (!checkSalespersonAccess(req.user, lead)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: you may only transition leads assigned to you.' },
      });
    }

    // Concurrency Check (Requirement #26)
    if (req.body.version !== undefined && Number(req.body.version) !== lead.version) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'LEAD_VERSION_CONFLICT',
          message: 'The lead was modified by another user. Refresh and try again.',
        },
      });
    }

    const targetStatus = normalizeLeadStatus(requestedStatus);
    const beforeState = lead.toObject();

    // Check if transition data includes reason or lossReason
    if (req.body.lossReason) {
      transitionData.lossReason = req.body.lossReason;
    } else if (!transitionData.lossReason && reason && targetStatus === 'LOST') {
      const upperReason = String(reason).trim().toUpperCase();
      if (ALLOWED_LOSS_REASONS.includes(upperReason)) {
        transitionData.lossReason = upperReason;
      }
    }
    if (reason && !transitionData.reason) transitionData.reason = reason;

    // Validate State Machine Transition (Requirements #6 - #13)
    const transitionValidation = validateStatusTransition(
      lead.status,
      targetStatus,
      lead.toObject(),
      transitionData
    );

    if (!transitionValidation.isValid) {
      const statusCode = transitionValidation.code === 'LEAD_ALREADY_CLOSED' ? 400 : 400;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: transitionValidation.code,
          message: transitionValidation.message,
          details: transitionValidation.errors,
        },
      });
    }

    const now = new Date();

    // Apply Transition Specific Fields
    lead.status = targetStatus;
    lead.updatedBy = String(actorId);
    lead.version = (lead.version || 1) + 1;

    if (targetStatus === 'CONTACTED') {
      lead.lastContactAt = now;
      lead.lastContactDate = now;
    } else if (targetStatus === 'QUALIFIED') {
      lead.qualifiedAt = now;
      if (transitionData.requirement) lead.requirement = transitionData.requirement;
      if (transitionData.expectedValue) lead.expectedValue = Number(transitionData.expectedValue);
      if (transitionData.nextFollowUpAt) {
        lead.nextFollowUpAt = new Date(transitionData.nextFollowUpAt);
        lead.nextFollowUpDate = lead.nextFollowUpAt;
      }
    } else if (targetStatus === 'PROPOSAL') {
      lead.proposalAt = now;
      if (transitionData.productService) lead.productService = transitionData.productService;
      if (transitionData.proposalValue) lead.proposalValue = Number(transitionData.proposalValue);
      if (transitionData.expectedClosingDate) lead.expectedClosingDate = new Date(transitionData.expectedClosingDate);
    } else if (targetStatus === 'NEGOTIATION') {
      lead.negotiationAt = now;
      if (transitionData.proposalValue) lead.proposalValue = Number(transitionData.proposalValue);
      if (transitionData.decisionMaker) lead.decisionMaker = transitionData.decisionMaker;
    } else if (targetStatus === 'WON') {
      lead.wonAt = now;
      if (transitionData.finalDealValue) lead.finalDealValue = Number(transitionData.finalDealValue);
    } else if (targetStatus === 'LOST') {
      lead.lostAt = now;
      lead.lossReason = transitionData.lossReason || 'OTHER';
    }

    // Save lead update
    await lead.save();

    // Idempotent Downstream Conversion for WON status (Requirement #12, #27)
    let createdDeal = null;
    let createdCustomer = null;
    if (targetStatus === 'WON') {
      // Find or create Customer
      createdCustomer = await Customer.findOne({
        companyName: new RegExp(`^${escapeRegex(lead.companyName)}$`, 'i'),
      });
      if (!createdCustomer) {
        createdCustomer = new Customer({
          companyName: lead.companyName,
          email: lead.email,
          phone: lead.phone,
          industry: lead.industry,
          assignedSalesperson: lead.assignedSalesperson,
          status: 'Active',
          contactPersons: [{
            name: lead.contactPerson,
            email: lead.email,
            phone: lead.phone,
            isPrimary: true,
          }],
        });
        await createdCustomer.save();
      }

      // Check if Deal already exists for this lead (Idempotency guarantee)
      createdDeal = await Deal.findOne({ lead: lead._id });
      if (!createdDeal) {
        const dealVal = lead.finalDealValue || lead.expectedValue || 100000;
        createdDeal = new Deal({
          opportunityName: `${lead.companyName} - Enterprise Deal`,
          customer: createdCustomer._id,
          lead: lead._id,
          salesperson: lead.assignedSalesperson,
          productService: lead.productService || 'Platform License',
          dealValue: dealVal,
          expectedClosingDate: lead.expectedClosingDate || now,
          actualClosingDate: now,
          probability: 100,
          stage: 'Won',
          wonAt: now,
        });
        await createdDeal.save();

        // Idempotent Revenue Record
        const existingRev = await Revenue.findOne({ deal: createdDeal._id });
        if (!existingRev) {
          const rev = new Revenue({
            deal: createdDeal._id,
            customer: createdCustomer._id,
            salesperson: lead.assignedSalesperson,
            amount: dealVal,
            productService: lead.productService || transitionData.productService || 'Enterprise Platform',
            paymentStatus: 'Paid',
            status: 'Valid',
            date: now,
            recognizedAt: now,
            invoiceNumber: `INV-${Date.now()}`,
          });
          await rev.save();
        }
      }

      lead.convertedToCustomer = createdCustomer._id;
      lead.convertedToDeal = createdDeal._id;
      await lead.save();
    }

    // Record Audit Log (Requirement #25)
    let auditAction = 'LEAD_STATUS_CHANGED';
    if (targetStatus === 'QUALIFIED') auditAction = 'LEAD_QUALIFIED';
    else if (targetStatus === 'WON') auditAction = 'LEAD_WON';
    else if (targetStatus === 'LOST') auditAction = 'LEAD_LOST';

    await recordAudit({
      actorId,
      action: auditAction,
      entityType: 'LEAD',
      entityId: lead.leadId,
      before: beforeState,
      after: lead.toObject(),
      requestId,
      ip: req.ip,
    });

    // Publish Domain Event (Requirement #24)
    let domainEventType = 'LeadStatusChanged';
    if (targetStatus === 'QUALIFIED') domainEventType = 'LeadQualified';
    else if (targetStatus === 'WON') domainEventType = 'LeadWon';
    else if (targetStatus === 'LOST') domainEventType = 'LeadLost';

    eventBus.publish(domainEventType, {
      entityType: 'Lead',
      entityId: lead.leadId,
      actorId,
      metadata: {
        from: beforeState.status,
        to: targetStatus,
        reason: reason || transitionData.lossReason,
      },
    });

    // Invalidate Redis Caches (Requirement #23)
    await invalidateLeadCaches(lead.leadId);

    // Asynchronous BullMQ background worker (Requirement #21)
    if (lead.nextFollowUpAt && targetStatus !== 'WON' && targetStatus !== 'LOST') {
      enqueueFollowUpJob(lead, `STATUS_CHANGED_TO_${targetStatus}`);
    }

    const populated = await Lead.findById(lead._id)
      .populate('assignedSalesperson', 'name email phone role')
      .populate('convertedToCustomer', 'companyName customerId')
      .populate('convertedToDeal', 'opportunityName dealId dealValue stage');

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
// 7. PATCH /api/v1/leads/:id/assignment — Salesperson Assignment Control (Req #18)
// ─────────────────────────────────────────────────────────────────────────────
exports.assignLead = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';
  const requestId = req.headers['x-request-id'] || null;

  try {
    // Only ADMIN and SALES_MANAGER are permitted to reassign leads
    const userRole = (req.user?.systemRole || 'ADMIN').toUpperCase();
    if (userRole !== 'ADMIN' && userRole !== 'SALES_MANAGER') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only Administrators and Sales Managers are authorized to assign or reassign leads.',
        },
      });
    }

    const targetSalespersonId = req.body.salespersonId || req.body.assignedSalesperson;
    if (!targetSalespersonId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_LEAD_DATA', message: 'Target salespersonId is required.' },
      });
    }

    const salesperson = await Salesperson.findById(targetSalespersonId);
    if (!salesperson || !salesperson.isActive) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'Target salesperson not found or inactive.' },
      });
    }

    const lead = await findLeadByIdentifier(req.params.id);
    if (!lead || lead.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'LEAD_NOT_FOUND', message: 'Lead not found or has been archived.' },
      });
    }

    const previousSalesperson = lead.assignedSalesperson;
    lead.assignedSalesperson = salesperson._id;
    lead.updatedBy = String(actorId);
    lead.version = (lead.version || 1) + 1;
    await lead.save();

    // Record Audit Trail (Requirement #18 & #25)
    await recordAudit({
      actorId,
      action: 'LEAD_REASSIGNED',
      entityType: 'LEAD',
      entityId: lead.leadId,
      before: { assignedSalesperson: previousSalesperson },
      after: {
        assignedSalesperson: salesperson._id,
        salespersonName: salesperson.name,
        reason: req.body.reason || 'Reassigned by management',
      },
      requestId,
      ip: req.ip,
    });

    // Publish Domain Event
    eventBus.publish('LeadAssigned', {
      entityType: 'Lead',
      entityId: lead.leadId,
      actorId,
      metadata: {
        previousSalesperson,
        newSalesperson: salesperson._id,
        salespersonName: salesperson.name,
      },
    });

    // Invalidate Redis Caches
    await invalidateLeadCaches(lead.leadId);

    const populated = await Lead.findById(lead._id).populate('assignedSalesperson', 'name email phone role');

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
// 8. PATCH /api/v1/leads/:id/archive — Archive Lead
// ─────────────────────────────────────────────────────────────────────────────
exports.archiveLead = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';
  const requestId = req.headers['x-request-id'] || null;

  try {
    const lead = await findLeadByIdentifier(req.params.id);
    if (!lead || lead.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'LEAD_NOT_FOUND', message: 'Lead not found or already archived.' },
      });
    }

    if (!checkSalespersonAccess(req.user, lead)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: you may only archive leads assigned to you.' },
      });
    }

    lead.isArchived = true;
    lead.archivedAt = new Date();
    lead.updatedBy = String(actorId);
    lead.version = (lead.version || 1) + 1;
    await lead.save();

    await recordAudit({
      actorId,
      action: 'LEAD_ARCHIVED',
      entityType: 'LEAD',
      entityId: lead.leadId,
      after: { isArchived: true, archivedAt: lead.archivedAt },
      requestId,
      ip: req.ip,
    });

    eventBus.publish('LeadArchived', {
      entityType: 'Lead',
      entityId: lead.leadId,
      actorId,
    });

    await invalidateLeadCaches(lead.leadId);

    res.json({
      success: true,
      message: `Lead ${lead.leadId} successfully archived.`,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. DELETE /api/v1/leads/:id — Soft delete lead (backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteLead = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const lead = await findLeadByIdentifier(req.params.id);
    if (!lead || lead.isDeleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'LEAD_NOT_FOUND', message: 'Lead not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, lead)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: you may only delete leads assigned to you.' },
      });
    }

    lead.isDeleted = true;
    lead.updatedBy = String(actorId);
    await lead.save();

    await recordAudit({
      actorId,
      action: 'LEAD_DELETED',
      entityType: 'LEAD',
      entityId: lead.leadId,
    });

    await invalidateLeadCaches(lead.leadId);

    res.json({
      success: true,
      message: 'Lead deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. GET /api/v1/leads/:id/activities — Get activities for this lead
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeadActivities = async (req, res, next) => {
  try {
    const lead = await findLeadByIdentifier(req.params.id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        error: { code: 'LEAD_NOT_FOUND', message: 'Lead not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, lead)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }

    const activities = await Activity.find({ lead: lead._id })
      .populate('salesperson', 'name email role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: activities,
    });
  } catch (err) {
    next(err);
  }
};
