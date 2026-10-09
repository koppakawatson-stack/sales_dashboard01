const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ALLOWED_ACTIVITY_TYPES,
  ALLOWED_OUTCOMES,
  ALLOWED_STATUSES,
  normalizeActivityType,
  validateActivityType,
  validateCustomerOrLead,
  validateSalesperson,
  validateDate,
  normalizeOutcome,
  normalizeStatus,
  validateActivity,
} = require('../src/utils/activityValidator');

describe('Sales Activity Management Pure Validation Controls', () => {

  describe('1. Activity Types & normalizeActivityType()', () => {
    it('supports all 7 required activity types', () => {
      const required = ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up', 'Proposal', 'Other'];
      required.forEach(t => {
        assert.ok(ALLOWED_ACTIVITY_TYPES.includes(t), `Must include ${t}`);
        assert.strictEqual(validateActivityType(t), true);
        assert.strictEqual(normalizeActivityType(t.toLowerCase()), t);
      });
    });

    it('rejects unsupported activity types', () => {
      assert.strictEqual(validateActivityType('RandomChat'), false);
      assert.strictEqual(validateActivityType('CoffeeBreak'), false);
      assert.strictEqual(validateActivityType(''), false);
      assert.strictEqual(validateActivityType(null), false);
    });
  });

  describe('2. Customer / Lead Association (validateCustomerOrLead)', () => {
    it('accepts when customer is provided', () => {
      assert.strictEqual(validateCustomerOrLead('6ac5cf6184f8766ad3c3c861', null), true);
      assert.strictEqual(validateCustomerOrLead('CUST-00001', ''), true);
    });

    it('accepts when lead is provided', () => {
      assert.strictEqual(validateCustomerOrLead(null, '6ac5cf6184f8766ad3c3c862'), true);
      assert.strictEqual(validateCustomerOrLead('', 'LEAD-00001'), true);
    });

    it('accepts when both customer and lead are provided', () => {
      assert.strictEqual(validateCustomerOrLead('CUST-1', 'LEAD-1'), true);
    });

    it('rejects when neither customer nor lead is provided', () => {
      assert.strictEqual(validateCustomerOrLead('', ''), false);
      assert.strictEqual(validateCustomerOrLead(null, null), false);
      assert.strictEqual(validateCustomerOrLead(undefined, undefined), false);
      assert.strictEqual(validateCustomerOrLead('   ', '   '), false);
    });
  });

  describe('3. Salesperson Assignment (validateSalesperson)', () => {
    it('accepts non-empty salesperson ID', () => {
      assert.strictEqual(validateSalesperson('6ac5cf6184f8766ad3c3c861'), true);
      assert.strictEqual(validateSalesperson('SP-001'), true);
    });

    it('rejects empty or whitespace salesperson ID', () => {
      assert.strictEqual(validateSalesperson(''), false);
      assert.strictEqual(validateSalesperson('   '), false);
      assert.strictEqual(validateSalesperson(null), false);
      assert.strictEqual(validateSalesperson(undefined), false);
    });
  });

  describe('4. Date Validation (validateDate)', () => {
    it('accepts valid date strings and objects', () => {
      assert.strictEqual(validateDate('2026-10-07T10:00:00.000Z'), true);
      assert.strictEqual(validateDate('2026-10-07'), true);
      assert.strictEqual(validateDate(new Date()), true);
      assert.strictEqual(validateDate(Date.now()), true);
    });

    it('rejects invalid dates and empty values', () => {
      assert.strictEqual(validateDate('not-a-date'), false);
      assert.strictEqual(validateDate(''), false);
      assert.strictEqual(validateDate(null), false);
      assert.strictEqual(validateDate(undefined), false);
    });
  });

  describe('5. Outcomes and Statuses Normalization', () => {
    it('normalizes valid outcomes correctly', () => {
      assert.strictEqual(normalizeOutcome('positive'), 'Positive');
      assert.strictEqual(normalizeOutcome('NEUTRAL'), 'Neutral');
      assert.strictEqual(normalizeOutcome('negative'), 'Negative');
      assert.strictEqual(normalizeOutcome('No Answer'), 'No Answer');
      assert.strictEqual(normalizeOutcome('pending'), 'Pending');
    });

    it('defaults unknown outcomes to Pending', () => {
      assert.strictEqual(normalizeOutcome('UnknownOutcome'), 'Pending');
      assert.strictEqual(normalizeOutcome(null), 'Pending');
      assert.strictEqual(normalizeOutcome(''), 'Pending');
    });

    it('normalizes valid statuses correctly', () => {
      assert.strictEqual(normalizeStatus('planned'), 'Planned');
      assert.strictEqual(normalizeStatus('COMPLETED'), 'Completed');
      assert.strictEqual(normalizeStatus('cancelled'), 'Cancelled');
    });

    it('defaults unknown statuses to Planned', () => {
      assert.strictEqual(normalizeStatus('InvalidStatus'), 'Planned');
      assert.strictEqual(normalizeStatus(null), 'Planned');
    });
  });

  describe('6. Full Activity Payload Validation (validateActivity)', () => {
    it('validates a complete, compliant activity payload', () => {
      const payload = {
        activityType: 'Meeting',
        salesperson: '6ac5cf6184f8766ad3c3c861',
        customer: '6ac5cf6184f8766ad3c3c870',
        date: '2026-10-07T11:00:00.000Z',
        duration: 45,
        notes: 'Executive presentation of Cloud Platform architecture.',
        nextAction: 'Send revised commercial proposal and SOW.',
        nextActionDate: '2026-10-10',
        outcome: 'Positive',
        status: 'Completed',
      };

      const result = validateActivity(payload);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.data.activityType, 'Meeting');
      assert.strictEqual(result.data.duration, 45);
      assert.strictEqual(result.data.outcome, 'Positive');
      assert.strictEqual(result.data.status, 'Completed');
    });

    it('fails when customer and lead are both missing', () => {
      const result = validateActivity({
        activityType: 'Call',
        salesperson: '6ac5cf6184f8766ad3c3c861',
      });
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.includes('customer account or a lead')));
    });

    it('fails when activityType is invalid', () => {
      const result = validateActivity({
        activityType: 'InvalidType',
        customer: '6ac5cf6184f8766ad3c3c870',
        salesperson: '6ac5cf6184f8766ad3c3c861',
      });
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.includes('Invalid activity type')));
    });

    it('fails when duration is negative', () => {
      const result = validateActivity({
        activityType: 'Call',
        customer: '6ac5cf6184f8766ad3c3c870',
        salesperson: '6ac5cf6184f8766ad3c3c861',
        duration: -15,
      });
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.includes('non-negative number')));
    });

    it('fails when nextActionDate is invalid', () => {
      const result = validateActivity({
        activityType: 'Follow-up',
        lead: '6ac5cf6184f8766ad3c3c871',
        salesperson: '6ac5cf6184f8766ad3c3c861',
        nextActionDate: 'invalid-date-string',
      });
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(e => e.includes('Next action date must be a valid date')));
    });
  });

});
