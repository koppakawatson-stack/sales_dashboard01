const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Revenue = require('../models/Revenue');
const Target = require('../models/Target');
const Salesperson = require('../models/Salesperson');
const Customer = require('../models/Customer');
const {
  calculateTargetAchievement,
  calculateConversionRate,
  calculatePercentageChange,
} = require('../utils/calculations');

/**
 * Executes MongoDB aggregations and calculates all 13 Sales Overview metrics
 * based on normalized dashboard filters.
 */
async function getSalesOverviewMetrics(normalizedFilters) {
  const { period, previousPeriod, matches, effectiveSalespersonId, filterSummary } = normalizedFilters;

  const now = new Date();
  const currentYear = (period.type === 'ALL' || period.type === 'CUSTOM')
    ? now.getUTCFullYear()
    : period.startDate.getUTCFullYear();
  const currentMonth = (period.type === 'ALL' || period.type === 'CUSTOM')
    ? now.getUTCMonth() + 1
    : period.startDate.getUTCMonth() + 1;

  // Global filter consistency: if industry is filtered, cross-match customer deals and revenues
  if (filterSummary?.industry) {
    const custs = await Customer.find({ industry: filterSummary.industry }).select('_id');
    const custIds = custs.map(c => c._id);
    matches.deals.customer = { $in: custIds };
    matches.revenues.customer = { $in: custIds };
  }

  // ── 1. Total Leads & New Leads (Current & Previous Periods) ──
  const leadsCountPromises = [
    // Current total leads matching filters
    Lead.countDocuments({ ...matches.leads, createdAt: { $lte: period.endDate } }),
    // Current new leads created within period
    Lead.countDocuments({
      ...matches.leads,
      createdAt: { $gte: period.startDate, $lte: period.endDate },
    }),
    // Current qualified leads
    Lead.countDocuments({
      ...matches.leads,
      status: { $in: ['QUALIFIED', 'Qualified'] },
    }),
  ];

  if (previousPeriod) {
    leadsCountPromises.push(
      Lead.countDocuments({ ...matches.leads, createdAt: { $lte: previousPeriod.endDate } }),
      Lead.countDocuments({
        ...matches.leads,
        createdAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate },
      }),
      Lead.countDocuments({
        ...matches.leads,
        status: { $in: ['QUALIFIED', 'Qualified'] },
        createdAt: { $lte: previousPeriod.endDate },
      })
    );
  } else {
    leadsCountPromises.push(Promise.resolve(0), Promise.resolve(0), Promise.resolve(0));
  }

  // ── 2. Opportunities (Active, Won, Lost, Pipeline Value) ──
  const dealsPromises = [
    // Active Opportunities count (NOT IN ['Won', 'Lost'])
    Deal.countDocuments({ ...matches.deals, stage: { $nin: ['Won', 'Lost'] } }),

    // Pipeline Value & Weighted Pipeline for active opportunities
    Deal.aggregate([
      { $match: { ...matches.deals, stage: { $nin: ['Won', 'Lost'] } } },
      {
        $group: {
          _id: null,
          totalValue: { $sum: '$dealValue' },
          weightedValue: { $sum: '$weightedValue' },
        },
      },
    ]),

    // Won Deals within period
    Deal.countDocuments({
      ...matches.deals,
      stage: 'Won',
      $or: [
        { wonAt: { $gte: period.startDate, $lte: period.endDate } },
        { actualClosingDate: { $gte: period.startDate, $lte: period.endDate } },
        { updatedAt: { $gte: period.startDate, $lte: period.endDate } },
      ],
    }),

    // Lost Deals within period
    Deal.countDocuments({
      ...matches.deals,
      stage: 'Lost',
      $or: [
        { lostAt: { $gte: period.startDate, $lte: period.endDate } },
        { updatedAt: { $gte: period.startDate, $lte: period.endDate } },
      ],
    }),
  ];

  if (previousPeriod) {
    dealsPromises.push(
      Deal.countDocuments({
        ...matches.deals,
        stage: 'Won',
        $or: [
          { wonAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate } },
          { actualClosingDate: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate } },
          { updatedAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate } },
        ],
      })
    );
  } else {
    dealsPromises.push(Promise.resolve(0));
  }

  // ── 3. Revenue (Won Revenue & Monthly Revenue) ──
  const revenuePromises = [
    // Total Won Revenue (All valid revenue matching filters)
    Revenue.aggregate([
      { $match: { ...matches.revenues } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),

    // Revenue recognized during reporting period
    Revenue.aggregate([
      {
        $match: {
          ...matches.revenues,
          $or: [
            { recognizedAt: { $gte: period.startDate, $lte: period.endDate } },
            { date: { $gte: period.startDate, $lte: period.endDate } },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ];

  if (previousPeriod) {
    revenuePromises.push(
      Revenue.aggregate([
        {
          $match: {
            ...matches.revenues,
            $or: [
              { recognizedAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate } },
              { date: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate } },
            ],
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
    );
  } else {
    revenuePromises.push(Promise.resolve([]));
  }

  // ── 4. Dynamic Target ──
  let targetQuery = { period: 'Monthly', year: currentYear, month: currentMonth };
  if (effectiveSalespersonId && mongoose.Types.ObjectId.isValid(effectiveSalespersonId)) {
    targetQuery.salesperson = new mongoose.Types.ObjectId(effectiveSalespersonId);
  } else {
    targetQuery.salesperson = null; // Company-wide
  }

  const targetPromise = Target.findOne(targetQuery).then(async (t) => {
    if (t && t.targetAmount > 0) return t.targetAmount;
    // Fallback: sum active salespersons' monthly targets if no company-wide record exists
    if (!effectiveSalespersonId) {
      const sps = await Salesperson.find({ isActive: true });
      const sum = sps.reduce((acc, s) => acc + (s.targets?.monthly || 0), 0);
      return sum;
    }
    return 0;
  });

  // Execute all aggregations in parallel
  const [
    [totalLeads, newLeads, qualifiedLeads, prevTotalLeads, prevNewLeads, prevQualifiedLeads],
    [activeOpportunities, pipelineAgg, wonDeals, lostDeals, prevWonDeals],
    [wonRevAgg, monthlyRevAgg, prevMonthlyRevAgg],
    monthlyTarget,
  ] = await Promise.all([
    Promise.all(leadsCountPromises),
    Promise.all(dealsPromises),
    Promise.all(revenuePromises),
    targetPromise,
  ]);

  const pipelineValue = pipelineAgg[0]?.totalValue || 0;
  const weightedPipelineValue = Math.round(pipelineAgg[0]?.weightedValue || 0);
  const wonRevenue = wonRevAgg[0]?.total || 0;
  const monthlyRevenue = monthlyRevAgg[0]?.total || 0;
  const prevMonthlyRevenue = prevMonthlyRevAgg[0]?.total || 0;

  const targetAchievement = calculateTargetAchievement(monthlyRevenue, monthlyTarget);
  const conversionRate = calculateConversionRate(wonDeals, qualifiedLeads);

  const prevConversionRate = calculateConversionRate(prevWonDeals, prevQualifiedLeads);

  const metrics = {
    totalLeads,
    newLeads,
    qualifiedLeads,
    activeOpportunities,
    wonDeals,
    lostDeals,
    pipelineValue,
    weightedPipelineValue,
    wonRevenue,
    monthlyRevenue,
    monthlyTarget,
    targetAchievement,
    conversionRate,
  };

  const comparisons = {
    totalLeads: {
      current: totalLeads,
      previous: prevTotalLeads,
      change: totalLeads - prevTotalLeads,
      percentageChange: calculatePercentageChange(totalLeads, prevTotalLeads),
    },
    newLeads: {
      current: newLeads,
      previous: prevNewLeads,
      change: newLeads - prevNewLeads,
      percentageChange: calculatePercentageChange(newLeads, prevNewLeads),
    },
    monthlyRevenue: {
      current: monthlyRevenue,
      previous: prevMonthlyRevenue,
      change: monthlyRevenue - prevMonthlyRevenue,
      percentageChange: calculatePercentageChange(monthlyRevenue, prevMonthlyRevenue),
    },
    wonDeals: {
      current: wonDeals,
      previous: prevWonDeals,
      change: wonDeals - prevWonDeals,
      percentageChange: calculatePercentageChange(wonDeals, prevWonDeals),
    },
    conversionRate: {
      current: conversionRate,
      previous: prevConversionRate,
      change: Number((conversionRate - prevConversionRate).toFixed(1)),
      percentageChange: calculatePercentageChange(conversionRate, prevConversionRate),
    },
  };

  return {
    period: {
      type: period.type,
      start: period.start,
      end: period.end,
    },
    metrics,
    comparisons,
    // Backward compatibility for existing dashboard components:
    totalLeads,
    newLeads,
    qualifiedLeads,
    activeOpportunities,
    wonDeals,
    lostDeals,
    totalPipeline: pipelineValue,
    weightedPipeline: weightedPipelineValue,
    wonRevenue,
    monthlyRevenue,
    monthlyTarget,
    targetAchievement,
    conversionRate,
  };
}

/**
 * Metric Control #13 — Salesperson Performance Aggregation
 * Dynamically aggregates real records across Salesperson, Lead, Deal, Revenue, and Target.
 */
async function getSalespersonPerformanceMetrics(normalizedFilters, sortBy = 'revenue', sortOrder = 'desc') {
  const { period, matches } = normalizedFilters;

  // Query active salespersons
  let spFilter = { isActive: true };
  if (normalizedFilters.effectiveSalespersonId && mongoose.Types.ObjectId.isValid(normalizedFilters.effectiveSalespersonId)) {
    spFilter._id = new mongoose.Types.ObjectId(normalizedFilters.effectiveSalespersonId);
  }

  const salespersons = await Salesperson.find(spFilter).select('name email role targets systemRole');

  // Aggregation for revenue in period per salesperson
  const revenueAgg = await Revenue.aggregate([
    {
      $match: {
        ...matches.revenues,
        $or: [
          { recognizedAt: { $gte: period.startDate, $lte: period.endDate } },
          { date: { $gte: period.startDate, $lte: period.endDate } },
        ],
      },
    },
    { $group: { _id: '$salesperson', revenue: { $sum: '$amount' } } },
  ]);

  // Aggregation for deals per salesperson
  const dealsAgg = await Deal.aggregate([
    { $match: { ...matches.deals } },
    {
      $group: {
        _id: '$salesperson',
        totalDeals: { $sum: 1 },
        wonDeals: { $sum: { $cond: [{ $eq: ['$stage', 'Won'] }, 1, 0] } },
        lostDeals: { $sum: { $cond: [{ $eq: ['$stage', 'Lost'] }, 1, 0] } },
        activeOpportunities: {
          $sum: { $cond: [{ $in: ['$stage', ['Won', 'Lost']] }, 0, 1] },
        },
        pipelineValue: {
          $sum: { $cond: [{ $in: ['$stage', ['Won', 'Lost']] }, 0, '$dealValue'] },
        },
      },
    },
  ]);

  // Aggregation for leads per salesperson
  const leadsAgg = await Lead.aggregate([
    { $match: { ...matches.leads } },
    {
      $group: {
        _id: '$assignedSalesperson',
        totalLeads: { $sum: 1 },
        qualifiedLeads: { $sum: { $cond: [{ $in: ['$status', ['QUALIFIED', 'Qualified']] }, 1, 0] } },
      },
    },
  ]);

  const revMap = Object.fromEntries(revenueAgg.map(r => [String(r._id), r.revenue]));
  const dealMap = Object.fromEntries(dealsAgg.map(d => [String(d._id), d]));
  const leadMap = Object.fromEntries(leadsAgg.map(l => [String(l._id), l]));

  const performance = salespersons.map((sp) => {
    const id = String(sp._id);
    const d = dealMap[id] || { totalDeals: 0, wonDeals: 0, lostDeals: 0, activeOpportunities: 0, pipelineValue: 0 };
    const l = leadMap[id] || { totalLeads: 0, qualifiedLeads: 0 };
    const wonRev = revMap[id] || 0;
    const target = sp.targets?.monthly || 0;
    const achievement = calculateTargetAchievement(wonRev, target);
    const conversion = calculateConversionRate(d.wonDeals, l.qualifiedLeads);

    return {
      salespersonId: id,
      salesperson: {
        _id: sp._id,
        name: sp.name,
        email: sp.email,
        role: sp.role,
      },
      name: sp.name,
      email: sp.email,
      role: sp.role,
      leads: l.totalLeads,
      totalLeads: l.totalLeads,
      qualifiedLeads: l.qualifiedLeads,
      activeOpportunities: d.activeOpportunities,
      pipelineValue: d.pipelineValue,
      wonDeals: d.wonDeals,
      lostDeals: d.lostDeals,
      totalDeals: d.totalDeals,
      wonRevenue: wonRev,
      monthlyRevenue: wonRev,
      target,
      monthlyTarget: target,
      achievement,
      conversionRate: conversion,
      activitiesThisMonth: 0, // populated when activity query available
    };
  });

  // Sort by requested criterion
  performance.sort((a, b) => {
    let valA = a.wonRevenue;
    let valB = b.wonRevenue;

    if (sortBy === 'achievement') {
      valA = a.achievement; valB = b.achievement;
    } else if (sortBy === 'pipeline') {
      valA = a.pipelineValue; valB = b.pipelineValue;
    } else if (sortBy === 'wonDeals') {
      valA = a.wonDeals; valB = b.wonDeals;
    } else if (sortBy === 'conversionRate') {
      valA = a.conversionRate; valB = b.conversionRate;
    }

    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  return performance;
}

module.exports = {
  getSalesOverviewMetrics,
  getSalespersonPerformanceMetrics,
};
