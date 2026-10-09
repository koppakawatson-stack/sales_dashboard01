const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ALLOWED_DEAL_STAGES,
  STAGE_DEFAULT_PROBABILITIES,
  canTransitionDealStage,
  validateOpportunityName,
  validateDealValue,
  validateProbability,
  validateExpectedClosingDate,
  calculateWeightedValue,
  normalizeStage,
  validateDeal,
} = require('../src/utils/dealValidator');

describe('Deal / Opportunity Management Pure Validation Controls', () => {
  describe('1. validateOpportunityName()', () => {
    it('accepts valid opportunity name', () => {
      assert.strictEqual(validateOpportunityName('Enterprise Cloud CRM'), true);
      assert.strictEqual(validateOpportunityName('ACME Corp - Analytics'), true);
    });

    it('rejects empty, null, or whitespace-only name', () => {
      assert.strictEqual(validateOpportunityName(''), false);
      assert.strictEqual(validateOpportunityName('   '), false);
      assert.strictEqual(validateOpportunityName(null), false);
      assert.strictEqual(validateOpportunityName(undefined), false);
      assert.strictEqual(validateOpportunityName('A'), false); // Less than 2 chars
    });
  });

  describe('2. validateDealValue()', () => {
    it('accepts positive numeric values and zero', () => {
      assert.strictEqual(validateDealValue(1500000), true);
      assert.strictEqual(validateDealValue('750000'), true);
      assert.strictEqual(validateDealValue(0), true);
    });

    it('rejects negative values and invalid characters', () => {
      assert.strictEqual(validateDealValue(-5000), false);
      assert.strictEqual(validateDealValue('invalid'), false);
      assert.strictEqual(validateDealValue(null), false);
      assert.strictEqual(validateDealValue(undefined), false);
    });
  });

  describe('3. validateProbability()', () => {
    it('accepts valid probability percentages between 0 and 100', () => {
      assert.strictEqual(validateProbability(0), true);
      assert.strictEqual(validateProbability(50), true);
      assert.strictEqual(validateProbability(100), true);
      assert.strictEqual(validateProbability('75'), true);
    });

    it('rejects numbers out of 0-100 range', () => {
      assert.strictEqual(validateProbability(-10), false);
      assert.strictEqual(validateProbability(105), false);
      assert.strictEqual(validateProbability('abc'), false);
      assert.strictEqual(validateProbability(null), false);
    });
  });

  describe('4. validateExpectedClosingDate()', () => {
    it('accepts valid date string and Date objects', () => {
      assert.strictEqual(validateExpectedClosingDate('2026-12-31'), true);
      assert.strictEqual(validateExpectedClosingDate(new Date()), true);
    });

    it('rejects invalid date string or null', () => {
      assert.strictEqual(validateExpectedClosingDate('not-a-date'), false);
      assert.strictEqual(validateExpectedClosingDate(null), false);
      assert.strictEqual(validateExpectedClosingDate(undefined), false);
    });
  });

  describe('5. calculateWeightedValue()', () => {
    it('correctly calculates weighted value = dealValue * (probability / 100)', () => {
      assert.strictEqual(calculateWeightedValue(1000000, 50), 500000);
      assert.strictEqual(calculateWeightedValue(2500000, 80), 2000000);
      assert.strictEqual(calculateWeightedValue(1000000, 0), 0);
      assert.strictEqual(calculateWeightedValue(1000000, 100), 1000000);
    });
  });

  describe('6. canTransitionDealStage() State Machine Matrix', () => {
    it('allows sequential forward progression: Lead -> Qualified -> Proposal -> Negotiation -> Won', () => {
      assert.strictEqual(canTransitionDealStage('Lead', 'Qualified'), true);
      assert.strictEqual(canTransitionDealStage('Qualified', 'Proposal'), true);
      assert.strictEqual(canTransitionDealStage('Proposal', 'Negotiation'), true);
      assert.strictEqual(canTransitionDealStage('Negotiation', 'Won'), true);
    });

    it('allows transitioning to Lost from any active stage', () => {
      assert.strictEqual(canTransitionDealStage('Lead', 'Lost'), true);
      assert.strictEqual(canTransitionDealStage('Qualified', 'Lost'), true);
      assert.strictEqual(canTransitionDealStage('Proposal', 'Lost'), true);
      assert.strictEqual(canTransitionDealStage('Negotiation', 'Lost'), true);
    });

    it('allows staying in the same stage (attribute edits)', () => {
      assert.strictEqual(canTransitionDealStage('Proposal', 'Proposal'), true);
      assert.strictEqual(canTransitionDealStage('Negotiation', 'Negotiation'), true);
    });

    it('REJECTS illegal jumps (skipping stages)', () => {
      assert.strictEqual(canTransitionDealStage('Lead', 'Won'), false);
      assert.strictEqual(canTransitionDealStage('Lead', 'Proposal'), false);
      assert.strictEqual(canTransitionDealStage('Lead', 'Negotiation'), false);
      assert.strictEqual(canTransitionDealStage('Qualified', 'Won'), false);
    });

    it('REJECTS moving out of terminal states (Won or Lost)', () => {
      assert.strictEqual(canTransitionDealStage('Won', 'Negotiation'), false);
      assert.strictEqual(canTransitionDealStage('Won', 'Lead'), false);
      assert.strictEqual(canTransitionDealStage('Won', 'Lost'), false);
      assert.strictEqual(canTransitionDealStage('Lost', 'Lead'), false);
      assert.strictEqual(canTransitionDealStage('Lost', 'Won'), false);
    });
  });

  describe('7. validateDeal() Comprehensive Validator', () => {
    it('validates a complete, healthy deal record', () => {
      const payload = {
        opportunityName: 'Acme Cloud Deployment',
        customer: '6ac50b6a55116dcb87f2daad',
        salesperson: '6ac50b6a55116dcb87f2daa8',
        productService: 'Enterprise Cloud Platform',
        dealValue: 1200000,
        expectedClosingDate: '2026-11-30',
        stage: 'Qualified',
        probability: 40,
        notes: 'Preliminary discussions positive.',
      };

      const result = validateDeal(payload);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.data.opportunityName, 'Acme Cloud Deployment');
      assert.strictEqual(result.data.dealValue, 1200000);
      assert.strictEqual(result.data.weightedValue, 480000);
      assert.strictEqual(result.data.probability, 40);
    });

    it('requires lostReason when stage is Lost', () => {
      const payload = {
        opportunityName: 'Stalled Project',
        customer: '6ac50b6a55116dcb87f2daad',
        salesperson: '6ac50b6a55116dcb87f2daa8',
        productService: 'Cloud Platform',
        dealValue: 500000,
        expectedClosingDate: '2026-11-30',
        stage: 'Lost',
        // missing lostReason
      };

      const result = validateDeal(payload);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.includes('reason is required when marking a deal as Lost')));
    });

    it('sets probability to 100 on Won and 0 on Lost', () => {
      const wonPayload = {
        opportunityName: 'Won Deal Example',
        customer: '6ac50b6a55116dcb87f2daad',
        salesperson: '6ac50b6a55116dcb87f2daa8',
        productService: 'Cloud Platform',
        dealValue: 1000000,
        expectedClosingDate: '2026-11-30',
        stage: 'Won',
      };
      const wonRes = validateDeal(wonPayload);
      assert.strictEqual(wonRes.isValid, true);
      assert.strictEqual(wonRes.data.probability, 100);
      assert.strictEqual(wonRes.data.weightedValue, 1000000);

      const lostPayload = {
        opportunityName: 'Lost Deal Example',
        customer: '6ac50b6a55116dcb87f2daad',
        salesperson: '6ac50b6a55116dcb87f2daa8',
        productService: 'Cloud Platform',
        dealValue: 1000000,
        expectedClosingDate: '2026-11-30',
        stage: 'Lost',
        lostReason: 'Budget constraints',
      };
      const lostRes = validateDeal(lostPayload);
      assert.strictEqual(lostRes.isValid, true);
      assert.strictEqual(lostRes.data.probability, 0);
      assert.strictEqual(lostRes.data.weightedValue, 0);
    });
  });
});
