const Deal = require('../models/Deal');
const Revenue = require('../models/Revenue');
const Target = require('../models/Target');
const Lead = require('../models/Lead');
const { getSalesOverviewMetrics } = require('./salesOverviewService');
const { normalizeDashboardFilters } = require('../utils/filterNormalizer');
const { calculateConversionRate } = require('../utils/calculations');

/**
 * Reconciliation Service: Independently verifies dashboard calculations
 * against raw database records to ensure 100% data integrity.
 */
async function runDashboardReconciliation(query = {}, user = null) {
  const normalized = normalizeDashboardFilters(query, user);
  const overview = await getSalesOverviewMetrics(normalized);

  // 1. Independent Pipeline check
  const activeDeals = await Deal.find({
    ...normalized.matches.deals,
    stage: { $nin: ['Won', 'Lost'] },
  }).select('dealValue');
  const manualPipelineSum = activeDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0);
  const pipelineMatchesOpportunities = manualPipelineSum === overview.metrics.pipelineValue;

  // 2. Independent Revenue check
  const validRevenues = await Revenue.find({
    ...normalized.matches.revenues,
  }).select('amount');
  const manualRevenueSum = validRevenues.reduce((sum, r) => sum + (r.amount || 0), 0);
  const revenueMatchesRevenueRecords = manualRevenueSum === overview.metrics.wonRevenue;

  // 3. Independent Target check
  const now = new Date();
  const reconYear = (normalized.period.type === 'ALL' || normalized.period.type === 'CUSTOM')
    ? now.getUTCFullYear()
    : normalized.period.startDate.getUTCFullYear();
  const reconMonth = (normalized.period.type === 'ALL' || normalized.period.type === 'CUSTOM')
    ? now.getUTCMonth() + 1
    : normalized.period.startDate.getUTCMonth() + 1;

  let targetQuery = { period: 'Monthly', year: reconYear, month: reconMonth };
  if (normalized.effectiveSalespersonId) {
    targetQuery.salesperson = normalized.effectiveSalespersonId;
  } else {
    targetQuery.salesperson = null;
  }
  const targetDoc = await Target.findOne(targetQuery);
  const expectedTarget = targetDoc?.targetAmount || 0;
  const targetMatchesTargetCollection = overview.metrics.monthlyTarget === expectedTarget;

  // 4. Independent Won Deals check
  const wonDealsCount = await Deal.countDocuments({
    ...normalized.matches.deals,
    stage: 'Won',
    $or: [
      { wonAt: { $gte: normalized.period.startDate, $lte: normalized.period.endDate } },
      { actualClosingDate: { $gte: normalized.period.startDate, $lte: normalized.period.endDate } },
      { updatedAt: { $gte: normalized.period.startDate, $lte: normalized.period.endDate } },
    ],
  });
  const wonDealsMatchOpportunityState = wonDealsCount === overview.metrics.wonDeals;

  // 5. Independent Conversion Calculation check
  const expectedConv = calculateConversionRate(overview.metrics.wonDeals, overview.metrics.qualifiedLeads);
  const conversionCalculationValid = overview.metrics.conversionRate === expectedConv;

  const checks = {
    pipelineMatchesOpportunities,
    revenueMatchesRevenueRecords,
    targetMatchesTargetCollection,
    wonDealsMatchOpportunityState,
    conversionCalculationValid,
  };

  const allPassed = Object.values(checks).every(Boolean);

  return {
    status: allPassed ? 'PASS' : 'FAIL',
    overallStatus: allPassed ? 'PASS' : 'FAIL',
    summary: {
      totalChecks: Object.keys(checks).length,
      passedChecks: Object.values(checks).filter(Boolean).length,
      failedChecks: Object.values(checks).filter(v => !v).length,
    },
    timestamp: new Date().toISOString(),
    checks,
    details: {
      calculatedPipeline: overview.metrics.pipelineValue,
      rawPipelineSum: manualPipelineSum,
      calculatedRevenue: overview.metrics.wonRevenue,
      rawRevenueSum: manualRevenueSum,
      calculatedWonDeals: overview.metrics.wonDeals,
      rawWonDealsCount: wonDealsCount,
      calculatedTarget: overview.metrics.monthlyTarget,
      rawTarget: expectedTarget,
      conversionRate: overview.metrics.conversionRate,
      expectedConversionRate: expectedConv,
    },
  };
}

module.exports = {
  runDashboardReconciliation,
};
