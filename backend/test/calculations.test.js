const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  calculateTargetAchievement,
  calculateConversionRate,
  calculatePipelineValue,
  calculateWeightedPipeline,
  calculatePercentageChange,
} = require('../src/utils/calculations');

const { normalizeDashboardFilters } = require('../src/utils/filterNormalizer');

describe('Pure Calculation Controls (Harness Engineering Verification)', () => {
  describe('calculateTargetAchievement', () => {
    test('calculates correct percentage for standard values (Metric Control #11)', () => {
      const result = calculateTargetAchievement(4280000, 5000000);
      assert.strictEqual(result, 85.6);
    });

    test('exceeds target correctly (> 100%)', () => {
      const result = calculateTargetAchievement(1500000, 1000000);
      assert.strictEqual(result, 150.0);
    });

    test('handles zero target safely without NaN or Infinity', () => {
      assert.strictEqual(calculateTargetAchievement(100000, 0), 0);
      assert.strictEqual(calculateTargetAchievement(0, 0), 0);
    });

    test('handles negative values safely', () => {
      assert.strictEqual(calculateTargetAchievement(-500, 100000), 0);
      assert.strictEqual(calculateTargetAchievement(500, -100000), 0);
    });

    test('handles non-numeric or string representations safely', () => {
      assert.strictEqual(calculateTargetAchievement('4280000', '5000000'), 85.6);
      assert.strictEqual(calculateTargetAchievement(null, undefined), 0);
      assert.strictEqual(calculateTargetAchievement('invalid', 5000000), 0);
    });
  });

  describe('calculateConversionRate', () => {
    test('calculates canonical conversion rate: (Won Deals / Qualified Leads) * 100 (Metric Control #12)', () => {
      const result = calculateConversionRate(40, 217);
      assert.strictEqual(result, 18.4);
    });

    test('handles zero qualified leads safely without NaN or Infinity', () => {
      assert.strictEqual(calculateConversionRate(0, 0), 0);
      assert.strictEqual(calculateConversionRate(5, 0), 0);
    });

    test('handles zero won deals safely', () => {
      assert.strictEqual(calculateConversionRate(0, 50), 0);
    });

    test('calculates 100% conversion rate accurately', () => {
      assert.strictEqual(calculateConversionRate(25, 25), 100.0);
    });

    test('handles invalid/null inputs gracefully', () => {
      assert.strictEqual(calculateConversionRate(null, undefined), 0);
      assert.strictEqual(calculateConversionRate(-5, 20), 0);
    });
  });

  describe('calculatePipelineValue', () => {
    test('sums only active opportunities, excluding Won and Lost (Metric Control #7)', () => {
      const deals = [
        { dealValue: 1800000, stage: 'Negotiation' },
        { dealValue: 850000, stage: 'Proposal' },
        { dealValue: 2500000, stage: 'Qualified' },
        { dealValue: 1200000, stage: 'Won' }, // Excluded
        { dealValue: 600000, stage: 'Lost' }, // Excluded
      ];
      const result = calculatePipelineValue(deals);
      assert.strictEqual(result, 1800000 + 850000 + 2500000);
    });

    test('handles empty array or invalid deals list', () => {
      assert.strictEqual(calculatePipelineValue([]), 0);
      assert.strictEqual(calculatePipelineValue(null), 0);
      assert.strictEqual(calculatePipelineValue([null, undefined]), 0);
    });
  });

  describe('calculateWeightedPipeline', () => {
    test('calculates sum(dealValue * probability / 100) for active deals', () => {
      const deals = [
        { dealValue: 1800000, stage: 'Negotiation', probability: 80 }, // 1,440,000
        { dealValue: 850000, stage: 'Proposal', probability: 40 },    // 340,000
        { dealValue: 1200000, stage: 'Won', probability: 100 },       // Excluded
      ];
      const result = calculateWeightedPipeline(deals);
      assert.strictEqual(result, 1440000 + 340000);
    });
  });

  describe('calculatePercentageChange', () => {
    test('calculates positive and negative percentage changes (Metric Control #1 & #18)', () => {
      assert.strictEqual(calculatePercentageChange(1240, 1144), 8.4);
      assert.strictEqual(calculatePercentageChange(90, 100), -10.0);
    });

    test('handles zero previous period value safely', () => {
      assert.strictEqual(calculatePercentageChange(50, 0), 100.0);
      assert.strictEqual(calculatePercentageChange(0, 0), 0);
      assert.strictEqual(calculatePercentageChange(-20, 0), -100.0);
    });
  });

  describe('normalizeDashboardFilters', () => {
    test('normalizes MONTH period with matching previous period', () => {
      const filter = normalizeDashboardFilters({ period: 'MONTH', year: 2026, month: 10 });
      assert.strictEqual(filter.period.type, 'MONTH');
      assert.strictEqual(filter.period.start, '2026-10-01');
      assert.strictEqual(filter.period.end, '2026-10-31');
      assert.strictEqual(filter.previousPeriod.start, '2026-09-01');
      assert.strictEqual(filter.previousPeriod.end, '2026-09-30');
      assert.ok(filter.cacheKey.startsWith('cache:sales:dashboard:overview:'));
    });

    test('enforces role-based salesperson scoping for SALESPERSON user', () => {
      const spId = new mongoose.Types.ObjectId();
      const user = { _id: spId, systemRole: 'SALESPERSON' };
      const filter = normalizeDashboardFilters({ period: 'MONTH' }, user);
      assert.strictEqual(filter.effectiveSalespersonId, spId.toString());
      assert.ok(filter.matches.leads.assignedSalesperson.equals(spId));
      assert.ok(filter.matches.deals.salesperson.equals(spId));
      assert.ok(filter.matches.revenues.salesperson.equals(spId));
    });

    test('allows global view for ADMIN user', () => {
      const user = { _id: new mongoose.Types.ObjectId(), systemRole: 'ADMIN' };
      const filter = normalizeDashboardFilters({ period: 'MONTH' }, user);
      assert.strictEqual(filter.effectiveSalespersonId, null);
      assert.strictEqual(filter.matches.leads.assignedSalesperson, undefined);
    });
  });
});
