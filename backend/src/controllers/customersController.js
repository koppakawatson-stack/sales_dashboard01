/**
 * HARVIK TECHNOLOGIES — CUSTOMER MANAGEMENT CONTROL LAYER
 * Implements strict CRUD, RBAC scoping, duplicate prevention, optimistic concurrency,
 * contract information management, revenue reconciliation, and audit trails.
 */

const crypto = require('crypto');
const Customer = require('../models/Customer');
const Revenue = require('../models/Revenue');
const Activity = require('../models/Activity');
const AuditLog = require('../models/AuditLog');
const { cacheGet, cacheSet, cacheDelPattern, cacheDel } = require('../config/redis');
const { validateCustomer, isRenewalUpcoming, isContractExpired } = require('../utils/customerValidator');

/**
 * Helper to resolve customer by either MongoDB _id or business customerId (e.g. CUST-00001).
 */
function findCustomerByIdentifier(id) {
  if (!id) return null;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
  if (isObjectId) {
    return Customer.findById(id);
  }
  return Customer.findOne({ customerId: id });
}

/**
 * Helper to check salesperson access control (Requirement #19 equivalent for Customers).
 */
function checkSalespersonAccess(user, customer) {
  if (!user) return true;
  const role = (user.systemRole || user.role || 'SALESPERSON').toUpperCase();
  if (role === 'ADMIN' || role === 'SALES_MANAGER') return true;
  if (role === 'SALESPERSON') {
    const assignedId = customer.assignedSalesperson?._id || customer.assignedSalesperson;
    if (!assignedId) return true;
    return String(assignedId) === String(user._id || user.id);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/v1/customers/stats — Customer Portfolio & Contract Analytics
// ─────────────────────────────────────────────────────────────────────────────
exports.getCustomerStats = async (req, res, next) => {
  try {
    const filter = { isArchived: { $ne: true } };

    // Salesperson data isolation
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    if (userRole === 'SALESPERSON') {
      filter.assignedSalesperson = req.user._id || req.user.id;
    }

    const customers = await Customer.find(filter).lean();

    const totalCustomers = customers.length;
    let activeCustomers = 0;
    let prospectCustomers = 0;
    let inactiveCustomers = 0;
    let churnedCustomers = 0;
    let totalRevenue = 0;
    let upcomingRenewals = 0;
    let expiredContracts = 0;
    let totalContractValue = 0;

    customers.forEach(c => {
      const s = (c.status || '').toUpperCase();
      if (s === 'ACTIVE') activeCustomers++;
      else if (s === 'PROSPECT') prospectCustomers++;
      else if (s === 'INACTIVE') inactiveCustomers++;
      else if (s === 'CHURNED') churnedCustomers++;

      totalRevenue += Number(c.totalRevenue || 0);

      if (c.contractInfo) {
        totalContractValue += Number(c.contractInfo.value || 0);
        if (isRenewalUpcoming(c.contractInfo.renewalDate, 30)) {
          upcomingRenewals++;
        }
        if (isContractExpired(c.contractInfo.endDate)) {
          expiredContracts++;
        }
      }
    });

    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        prospectCustomers,
        inactiveCustomers,
        churnedCustomers,
        totalRevenue,
        totalContractValue,
        upcomingRenewals,
        expiredContracts,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/v1/customers — List Customers with Pagination, Search & Filters
// ─────────────────────────────────────────────────────────────────────────────
exports.getCustomers = async (req, res, next) => {
  try {
    const {
      status,
      salesperson,
      industry,
      page = 1,
      limit = 20,
      search,
      sort = 'createdAt:desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const filter = { isArchived: { $ne: true } };

    // Role-based salesperson data isolation
    const userRole = (req.user?.systemRole || req.user?.role || '').toUpperCase();
    if (userRole === 'SALESPERSON') {
      filter.assignedSalesperson = req.user._id || req.user.id;
    } else if (salesperson) {
      filter.assignedSalesperson = salesperson;
    }

    if (status) filter.status = status;
    if (industry) filter.industry = industry;

    if (search && String(search).trim()) {
      const term = String(search).trim();
      const searchConditions = [
        { customerId: { $regex: term, $options: 'i' } },
        { companyName: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
      ];
      filter.$or = searchConditions;
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
    const cacheKey = `cache:customers:list:${filterHash}`;

    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) {
      return res.json(cached.data);
    }

    const [total, customers] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter)
        .populate('assignedSalesperson', 'name email role')
        .sort(sortOptions)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    const response = {
      success: true,
      data: {
        customers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      },
      // Backward compatibility keys for existing frontend table components:
      customers,
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
// 3. GET /api/v1/customers/:id — Fetch Single Customer by ID
// ─────────────────────────────────────────────────────────────────────────────
exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await findCustomerByIdentifier(req.params.id)
      .populate('assignedSalesperson', 'name email phone role');

    if (!customer || customer.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, customer)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: this customer is assigned to another salesperson.' },
      });
    }

    res.json({
      success: true,
      data: customer,
      // Backward compatibility:
      ...customer.toObject(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/v1/customers — Create Customer with Duplicate Prevention
// ─────────────────────────────────────────────────────────────────────────────
exports.createCustomer = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const validation = validateCustomer(req.body);
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

    // Duplicate Prevention Control (unless allowDuplicate override is true)
    if (!req.body.allowDuplicate) {
      const duplicateConditions = [];
      if (payload.email) duplicateConditions.push({ email: payload.email });
      if (payload.companyName) {
        duplicateConditions.push({ companyName: { $regex: `^${payload.companyName.trim()}$`, $options: 'i' } });
      }

      if (duplicateConditions.length > 0) {
        const existing = await Customer.findOne({
          $or: duplicateConditions,
          isArchived: { $ne: true },
        });

        if (existing) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'POSSIBLE_DUPLICATE_CUSTOMER',
              message: `A customer with this company name or email already exists (${existing.customerId}).`,
            },
            data: {
              existingCustomerId: existing.customerId,
              companyName: existing.companyName,
            },
          });
        }
      }
    }

    // Role scoping: salesperson creating customer is automatically assigned
    if (req.user?.role === 'SALESPERSON') {
      payload.assignedSalesperson = req.user._id;
    }

    payload.createdBy = String(actorId);

    const customer = new Customer(payload);
    await customer.save();

    // Audit Log Entry
    await AuditLog.create({
      actorId: String(actorId),
      action: 'CUSTOMER_CREATED',
      entityType: 'CUSTOMER',
      entityId: customer.customerId || String(customer._id),
      after: {
        companyName: customer.companyName,
        status: customer.status,
        assignedSalesperson: customer.assignedSalesperson,
      },
    });

    // Invalidate caches
    await cacheDelPattern('cache:customers:*');
    await cacheDelPattern('cache:dashboard:*');

    res.status(201).json({
      success: true,
      data: customer,
      // Backward compatibility:
      ...customer.toObject(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. PATCH/PUT /api/v1/customers/:id — Update Customer with Optimistic Locking
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCustomer = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const customer = await findCustomerByIdentifier(req.params.id);
    if (!customer || customer.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, customer)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: you may only update customers assigned to you.' },
      });
    }

    // Optimistic Concurrency Control (Version Conflict Check)
    if (req.body.version !== undefined && Number(req.body.version) !== customer.version) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CUSTOMER_VERSION_CONFLICT',
          message: 'The customer record was modified by another user. Refresh and try again.',
        },
      });
    }

    const beforeState = customer.toObject();

    // Validate update fields
    const merged = { ...customer.toObject(), ...req.body };
    const validation = validateCustomer(merged);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: validation.errors.join(' ') },
      });
    }

    // Apply updates
    const updates = validation.data;
    delete updates.customerId; // Immutable
    delete updates._id;

    // Salesperson cannot change assignment via general update
    if (req.user?.role === 'SALESPERSON') {
      delete updates.assignedSalesperson;
    }

    Object.assign(customer, updates);
    customer.version = (customer.version || 1) + 1;
    customer.updatedBy = String(actorId);

    await customer.save();

    // Audit Log Entry
    await AuditLog.create({
      actorId: String(actorId),
      action: 'CUSTOMER_UPDATED',
      entityType: 'CUSTOMER',
      entityId: customer.customerId,
      before: { companyName: beforeState.companyName, status: beforeState.status },
      after: { companyName: customer.companyName, status: customer.status },
    });

    // Invalidate caches
    await cacheDelPattern('cache:customers:*');
    await cacheDel(`cache:customer:${customer.customerId}`);

    res.json({
      success: true,
      data: customer,
      // Backward compatibility:
      ...customer.toObject(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. PATCH /api/v1/customers/:id/assignment — Reassign Salesperson (RBAC Controlled)
// ─────────────────────────────────────────────────────────────────────────────
exports.assignCustomer = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const { salespersonId, reason } = req.body;
    if (!salespersonId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATA', message: 'Target salespersonId is required.' },
      });
    }

    const customer = await findCustomerByIdentifier(req.params.id);
    if (!customer || customer.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' },
      });
    }

    const previousSalesperson = customer.assignedSalesperson;
    customer.assignedSalesperson = salespersonId;
    customer.version = (customer.version || 1) + 1;
    customer.updatedBy = String(actorId);

    await customer.save();

    // Audit Log
    await AuditLog.create({
      actorId: String(actorId),
      action: 'CUSTOMER_REASSIGNED',
      entityType: 'CUSTOMER',
      entityId: customer.customerId,
      before: { assignedSalesperson: previousSalesperson },
      after: { assignedSalesperson: salespersonId, reason: reason || 'Sales territory reassignment' },
    });

    await cacheDelPattern('cache:customers:*');

    res.json({
      success: true,
      data: customer,
      message: 'Customer reassigned successfully.',
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. PATCH /api/v1/customers/:id/archive — Soft Archive Customer
// ─────────────────────────────────────────────────────────────────────────────
exports.archiveCustomer = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const customer = await findCustomerByIdentifier(req.params.id);
    if (!customer || customer.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' },
      });
    }

    customer.isArchived = true;
    customer.version = (customer.version || 1) + 1;
    await customer.save();

    await AuditLog.create({
      actorId: String(actorId),
      action: 'CUSTOMER_ARCHIVED',
      entityType: 'CUSTOMER',
      entityId: customer.customerId,
    });

    await cacheDelPattern('cache:customers:*');

    res.json({
      success: true,
      message: 'Customer archived successfully.',
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. DELETE /api/v1/customers/:id — Remove Customer
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteCustomer = async (req, res, next) => {
  const actorId = req.user?._id || 'SYSTEM';

  try {
    const customer = await findCustomerByIdentifier(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' },
      });
    }

    customer.isArchived = true;
    await customer.save();

    await AuditLog.create({
      actorId: String(actorId),
      action: 'CUSTOMER_DELETED',
      entityType: 'CUSTOMER',
      entityId: customer.customerId,
    });

    await cacheDelPattern('cache:customers:*');

    res.json({
      success: true,
      message: 'Customer deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET /api/v1/customers/:id/activities — Customer Activity Timeline
// ─────────────────────────────────────────────────────────────────────────────
exports.getCustomerActivities = async (req, res, next) => {
  try {
    const customer = await findCustomerByIdentifier(req.params.id);
    if (!customer || customer.isArchived) {
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' },
      });
    }

    if (!checkSalespersonAccess(req.user, customer)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }

    const activities = await Activity.find({ customer: customer._id })
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
