const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * Normalizes dashboard query parameters and enforces user role scoping.
 * Guarantees filter consistency across all 13 Sales Overview metrics.
 */
function normalizeDashboardFilters(query = {}, user = null) {
  const now = new Date();
  const periodType = (query.period || 'MONTH').toUpperCase();

  let currentStart;
  let currentEnd;
  let prevStart;
  let prevEnd;

  if (periodType === 'CUSTOM' && query.startDate && query.endDate) {
    currentStart = new Date(query.startDate);
    currentEnd = new Date(query.endDate);
    if (isNaN(currentStart.getTime())) currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (isNaN(currentEnd.getTime())) currentEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const durationMs = currentEnd.getTime() - currentStart.getTime();
    prevEnd = new Date(currentStart.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - durationMs);
  } else if (periodType === 'QUARTER') {
    const currentQuarter = Math.floor(now.getUTCMonth() / 3);
    currentStart = new Date(Date.UTC(now.getUTCFullYear(), currentQuarter * 3, 1));
    currentEnd = new Date(Date.UTC(now.getUTCFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999));

    const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
    const prevYear = currentQuarter === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    prevStart = new Date(Date.UTC(prevYear, prevQuarter * 3, 1));
    prevEnd = new Date(Date.UTC(prevYear, (prevQuarter + 1) * 3, 0, 23, 59, 59, 999));
  } else if (periodType === 'YEAR') {
    const yr = Number(query.year) || now.getUTCFullYear();
    currentStart = new Date(Date.UTC(yr, 0, 1));
    currentEnd = new Date(Date.UTC(yr, 11, 31, 23, 59, 59, 999));

    prevStart = new Date(Date.UTC(yr - 1, 0, 1));
    prevEnd = new Date(Date.UTC(yr - 1, 11, 31, 23, 59, 59, 999));
  } else if (periodType === 'ALL') {
    currentStart = new Date(Date.UTC(2000, 0, 1));
    currentEnd = new Date(Date.UTC(now.getUTCFullYear() + 10, 11, 31, 23, 59, 59, 999));
    prevStart = null;
    prevEnd = null;
  } else {
    // Default: MONTH
    const yr = Number(query.year) || now.getUTCFullYear();
    const mo = query.month !== undefined ? Number(query.month) - 1 : now.getUTCMonth();
    currentStart = new Date(Date.UTC(yr, mo, 1));
    currentEnd = new Date(Date.UTC(yr, mo + 1, 0, 23, 59, 59, 999));

    const prevMo = mo === 0 ? 11 : mo - 1;
    const prevYr = mo === 0 ? yr - 1 : yr;
    prevStart = new Date(Date.UTC(prevYr, prevMo, 1));
    prevEnd = new Date(Date.UTC(prevYr, prevMo + 1, 0, 23, 59, 59, 999));
  }

  // Role-based salesperson scoping (Requirement #21)
  let effectiveSalespersonId = query.salespersonId || null;
  if (user && user.systemRole === 'SALESPERSON') {
    effectiveSalespersonId = String(user._id || user.id);
  }

  const customerId = query.customerId || null;
  const industry = query.industry || null;
  const productId = query.productId || null;
  const leadSource = query.leadSource || null;
  const stage = query.stage || null;
  const status = query.status || null;

  // Normalized MongoDB Match Filters
  const leadsMatch = { isDeleted: false };
  const dealsMatch = { isDeleted: false };
  const revenuesMatch = { status: { $in: ['Paid', 'Valid'] } };
  const targetsMatch = {};

  if (effectiveSalespersonId && mongoose.Types.ObjectId.isValid(effectiveSalespersonId)) {
    const spObjId = new mongoose.Types.ObjectId(effectiveSalespersonId);
    leadsMatch.assignedSalesperson = spObjId;
    dealsMatch.salesperson = spObjId;
    revenuesMatch.salesperson = spObjId;
    targetsMatch.salesperson = spObjId;
  }

  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    const custObjId = new mongoose.Types.ObjectId(customerId);
    dealsMatch.customer = custObjId;
    revenuesMatch.customer = custObjId;
  }

  if (industry) {
    leadsMatch.industry = industry;
  }

  if (leadSource) {
    leadsMatch.source = leadSource;
  }

  if (productId) {
    dealsMatch.productService = productId;
    revenuesMatch.productService = productId;
  }

  if (stage) {
    dealsMatch.stage = stage;
  }

  if (status) {
    const upper = status.toUpperCase();
    leadsMatch.status = { $in: [upper, status] };
  }

  // Canonical string for cache key hashing
  const filterSummary = {
    periodType,
    start: currentStart.toISOString(),
    end: currentEnd.toISOString(),
    salespersonId: effectiveSalespersonId,
    customerId,
    industry,
    productId,
    leadSource,
    stage,
    status,
    role: user?.systemRole || 'PUBLIC',
  };

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(filterSummary))
    .digest('hex')
    .substring(0, 16);

  return {
    period: {
      type: periodType,
      start: currentStart.toISOString().slice(0, 10),
      end: currentEnd.toISOString().slice(0, 10),
      startDate: currentStart,
      endDate: currentEnd,
    },
    previousPeriod: prevStart ? {
      start: prevStart.toISOString().slice(0, 10),
      end: prevEnd.toISOString().slice(0, 10),
      startDate: prevStart,
      endDate: prevEnd,
    } : null,
    effectiveSalespersonId,
    matches: {
      leads: leadsMatch,
      deals: dealsMatch,
      revenues: revenuesMatch,
      targets: targetsMatch,
    },
    filterSummary,
    cacheKey: `cache:sales:dashboard:overview:${hash}`,
  };
}

module.exports = {
  normalizeDashboardFilters,
};
