/**
 * Pure calculation functions for Sales Overview Metrics
 * Conforms to HARVIK Technologies business rules & harness engineering standards
 */

/**
 * Metric Control #11 — Target Achievement
 * Formula: (monthlyRevenue / monthlyTarget) * 100
 * Handles 0 target, negative revenue, Infinity, and NaN safely.
 */
function calculateTargetAchievement(revenue, target) {
  const rev = Number(revenue) || 0;
  const tgt = Number(target) || 0;

  if (tgt <= 0 || rev <= 0) return 0;
  const achievement = (rev / tgt) * 100;
  if (!Number.isFinite(achievement) || Number.isNaN(achievement)) return 0;
  return Number(achievement.toFixed(1));
}

/**
 * Metric Control #12 — Conversion Rate
 * Canonical Definition: (Won Deals / Qualified Leads) * 100
 * Handles division by zero safely without producing NaN or Infinity.
 */
function calculateConversionRate(wonDeals, qualifiedLeads) {
  const won = Number(wonDeals) || 0;
  const qualified = Number(qualifiedLeads) || 0;

  if (qualified <= 0 || won <= 0) return 0;
  const rate = (won / qualified) * 100;
  if (!Number.isFinite(rate) || Number.isNaN(rate)) return 0;
  return Number(rate.toFixed(1));
}

/**
 * Metric Control #7 — Total Pipeline Value
 * Formula: SUM(dealValue) for active opportunities (NOT IN ['Won', 'Lost'])
 */
function calculatePipelineValue(deals = []) {
  if (!Array.isArray(deals)) return 0;
  return deals
    .filter(d => d && !['Won', 'Lost'].includes(d.stage))
    .reduce((sum, d) => sum + (Number(d.dealValue) || 0), 0);
}

/**
 * Metric Control #7 — Weighted Pipeline Value
 * Formula: SUM(dealValue * (probability / 100)) for active opportunities
 */
function calculateWeightedPipeline(deals = []) {
  if (!Array.isArray(deals)) return 0;
  const total = deals
    .filter(d => d && !['Won', 'Lost'].includes(d.stage))
    .reduce((sum, d) => {
      const val = Number(d.dealValue) || 0;
      const prob = Number(d.probability) || 0;
      return sum + (val * Math.min(100, Math.max(0, prob))) / 100;
    }, 0);
  return Math.round(total);
}

/**
 * Metric Control #1 & #18 — Percentage Change vs. Previous Period
 * Formula: ((current - previous) / previous) * 100
 * Handles zero previous period safely.
 */
function calculatePercentageChange(current, previous) {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;

  if (prev === 0) {
    if (curr === 0) return 0;
    return curr > 0 ? 100 : -100;
  }

  const change = ((curr - prev) / prev) * 100;
  if (!Number.isFinite(change) || Number.isNaN(change)) return 0;
  return Number(change.toFixed(1));
}

function calculateAchievement(revenue, target) {
  return calculateTargetAchievement(revenue, target);
}

function calculateRemainingTarget(target, revenue) {
  const tgt = Number(target) || 0;
  const rev = Number(revenue) || 0;
  return Math.max(0, tgt - rev);
}

module.exports = {
  calculateTargetAchievement,
  calculateAchievement,
  calculateRemainingTarget,
  calculateConversionRate,
  calculatePipelineValue,
  calculateWeightedPipeline,
  calculatePercentageChange,
};

