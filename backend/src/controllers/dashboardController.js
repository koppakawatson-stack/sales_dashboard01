const { v4: uuidv4 } = require('uuid');
const { normalizeDashboardFilters } = require('../utils/filterNormalizer');
const {
  getSalesOverviewMetrics,
  getSalespersonPerformanceMetrics,
} = require('../services/salesOverviewService');
const { runDashboardReconciliation } = require('../services/reconciliationService');
const { cacheGet, cacheSet } = require('../config/redis');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');

/**
 * GET /api/v1/dashboard/overview
 * Master Sales Overview endpoint dynamically computing all 13 core metrics.
 */
exports.getDashboardOverview = async (req, res, next) => {
  const reqStart = Date.now();
  const requestId = req.headers['x-request-id'] || uuidv4();
  const userId = req.user?._id || req.user?.id || 'anonymous';

  try {
    // 1. Normalize dashboard filters & enforce role-based scoping
    const normalized = normalizeDashboardFilters(req.query, req.user);
    const { cacheKey } = normalized;

    // 2. Redis 7 cache lookup with non-fatal fallback
    const cacheResult = await cacheGet(cacheKey);
    if (cacheResult.hit && cacheResult.data) {
      const totalDuration = Date.now() - reqStart;
      console.log(`[DASHBOARD_OVERVIEW] requestId=${requestId} user=${userId} cache=HIT redisTime=${cacheResult.duration}ms totalTime=${totalDuration}ms`);
      res.set('x-cache', 'HIT');
      return res.json(cacheResult.data);
    }

    // 3. Cache miss: Execute MongoDB aggregation pipelines
    const mongoStart = Date.now();
    const [overviewData, salespersonPerformance] = await Promise.all([
      getSalesOverviewMetrics(normalized),
      getSalespersonPerformanceMetrics(
        normalized,
        req.query.sortBy || 'revenue',
        req.query.sortOrder || 'desc'
      ),
    ]);
    const mongoDuration = Date.now() - mongoStart;

    // 4. Construct production structured response
    const payload = {
      success: true,
      data: {
        period: overviewData.period,
        metrics: overviewData.metrics,
        comparisons: overviewData.comparisons,
        salespersonPerformance,
        generatedAt: new Date().toISOString(),
      },
      // Backward compatibility for existing dashboard components
      totalLeads: overviewData.totalLeads,
      newLeads: overviewData.newLeads,
      qualifiedLeads: overviewData.qualifiedLeads,
      activeOpportunities: overviewData.activeOpportunities,
      wonDeals: overviewData.wonDeals,
      lostDeals: overviewData.lostDeals,
      totalPipeline: overviewData.totalPipeline,
      weightedPipeline: overviewData.weightedPipeline,
      wonRevenue: overviewData.wonRevenue,
      monthlyRevenue: overviewData.monthlyRevenue,
      monthlyTarget: overviewData.monthlyTarget,
      targetAchievement: overviewData.targetAchievement,
      conversionRate: overviewData.conversionRate,
      salespersonPerformance,
    };

    // 5. Store in Redis 7 (TTL: 60s)
    const redisWriteDuration = await cacheSet(cacheKey, payload, 60);

    const totalDuration = Date.now() - reqStart;
    console.log(
      `[DASHBOARD_OVERVIEW] requestId=${requestId} user=${userId} cache=MISS mongoTime=${mongoDuration}ms redisWrite=${redisWriteDuration}ms totalTime=${totalDuration}ms`
    );

    res.set('x-cache', 'MISS');
    res.json(payload);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/dashboard/overview/reconciliation
 * Internal verification endpoint independently reconciling calculations against raw documents.
 */
exports.getReconciliation = async (req, res, next) => {
  try {
    const result = await runDashboardReconciliation(req.query, req.user);
    res.json({
      success: result.status === 'PASS',
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/dashboard/salesperson-performance
 * Salesperson performance leaderboard with sorting.
 */
exports.getSalespersonPerformance = async (req, res, next) => {
  try {
    const normalized = normalizeDashboardFilters(req.query, req.user);
    const performance = await getSalespersonPerformanceMetrics(
      normalized,
      req.query.sortBy || 'revenue',
      req.query.sortOrder || 'desc'
    );
    res.json(performance);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/dashboard/recent-activities
 */
exports.getRecentActivities = async (req, res, next) => {
  try {
    const activities = await Activity.find()
      .populate('salesperson', 'name')
      .populate('customer', 'companyName')
      .populate('lead', 'companyName')
      .sort({ createdAt: -1 })
      .limit(10);
    res.json(activities);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/dashboard/upcoming-followups
 */
exports.getUpcomingFollowUps = async (req, res, next) => {
  try {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const leads = await Lead.find({
      isDeleted: false,
      isArchived: false,
      $or: [
        { nextFollowUpAt: { $gte: now, $lte: nextWeek } },
        { nextFollowUpDate: { $gte: now, $lte: nextWeek } },
      ],
      status: { $nin: ['Won', 'Lost', 'WON', 'LOST'] },
    })
      .populate('assignedSalesperson', 'name')
      .sort({ nextFollowUpDate: 1 })
      .limit(10);

    res.json(leads);
  } catch (err) {
    next(err);
  }
};
