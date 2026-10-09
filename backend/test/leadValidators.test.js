const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateEmail,
  validatePhone,
  validateExpectedValue,
  calculateLeadAge,
  isFollowUpOverdue,
  normalizeLeadStatus,
  normalizeLeadSource,
  validateLead,
} = require('../src/utils/leadValidator');

const {
  canTransitionLead,
  validateContacted,
  validateQualification,
  validateProposal,
  validateNegotiation,
  validateWon,
  validateLost,
  validateStatusTransition,
} = require('../src/services/leadStateMachine');

const {
  calculateLeadQualityScore,
} = require('../src/services/leadScoringService');

describe('Lead Management Unit Tests (Section 34 & 35)', () => {

  describe('1. validateEmail()', () => {
    test('accepts valid email and normalizes to lowercase', () => {
      const res = validateEmail('John@Company.COM');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalized, 'john@company.com');
    });

    test('accepts email with subdomain and special valid characters', () => {
      const res = validateEmail('user.name+tag@sub.domain.co.in');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalized, 'user.name+tag@sub.domain.co.in');
    });

    test('rejects malformed email without @', () => {
      const res = validateEmail('notanemail.com');
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error);
    });

    test('rejects malformed email without domain', () => {
      const res = validateEmail('john@');
      assert.strictEqual(res.isValid, false);
    });

    test('accepts null/empty email as optional', () => {
      const res = validateEmail(null);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalized, null);
    });
  });

  describe('2. validatePhone()', () => {
    test('accepts valid phone numbers in international and local formats', () => {
      const res1 = validatePhone('+91 9876543210');
      assert.strictEqual(res1.isValid, true);
      const res2 = validatePhone('9876543210');
      assert.strictEqual(res2.isValid, true);
    });

    test('rejects phone numbers with fewer than 7 digits', () => {
      const res = validatePhone('12345');
      assert.strictEqual(res.isValid, false);
    });

    test('rejects phone numbers with alphabetical characters', () => {
      const res = validatePhone('call-me-now-1234');
      assert.strictEqual(res.isValid, false);
    });

    test('accepts empty/null phone as optional', () => {
      const res = validatePhone(null);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalized, null);
    });
  });

  describe('3. validateExpectedValue()', () => {
    test('accepts positive numeric values', () => {
      const res = validateExpectedValue(500000);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.value, 500000);
    });

    test('accepts 0', () => {
      const res = validateExpectedValue(0);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.value, 0);
    });

    test('rejects negative numbers', () => {
      const res = validateExpectedValue(-500);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error);
    });

    test('rejects non-numeric string', () => {
      const res = validateExpectedValue('invalid_amount');
      assert.strictEqual(res.isValid, false);
    });

    test('defaults empty/null to 0', () => {
      const res = validateExpectedValue(null);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.value, 0);
    });
  });

  describe('4. calculateLeadAge()', () => {
    test('calculates correct lead age in days', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const age = calculateLeadAge(fiveDaysAgo);
      assert.strictEqual(age, 5);
    });

    test('returns 0 for brand new leads or future date', () => {
      const age = calculateLeadAge(new Date());
      assert.strictEqual(age, 0);
    });

    test('handles invalid date safely', () => {
      assert.strictEqual(calculateLeadAge(null), 0);
      assert.strictEqual(calculateLeadAge('invalid'), 0);
    });
  });

  describe('5. isFollowUpOverdue()', () => {
    test('identifies past follow-up as overdue for active lead', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      assert.strictEqual(isFollowUpOverdue(yesterday, 'NEW'), true);
      assert.strictEqual(isFollowUpOverdue(yesterday, 'QUALIFIED'), true);
      assert.strictEqual(isFollowUpOverdue(yesterday, 'NEGOTIATION'), true);
    });

    test('does NOT mark future follow-up as overdue', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      assert.strictEqual(isFollowUpOverdue(tomorrow, 'NEW'), false);
    });

    test('does NOT mark WON or LOST leads as overdue even if date is past (Req #20)', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      assert.strictEqual(isFollowUpOverdue(yesterday, 'WON'), false);
      assert.strictEqual(isFollowUpOverdue(yesterday, 'LOST'), false);
    });

    test('returns false when no follow-up date exists', () => {
      assert.strictEqual(isFollowUpOverdue(null, 'NEW'), false);
    });
  });

  describe('6. canTransitionLead() State Machine Matrix', () => {
    test('allows canonical progression: NEW -> CONTACTED -> QUALIFIED -> PROPOSAL -> NEGOTIATION -> WON', () => {
      assert.strictEqual(canTransitionLead('NEW', 'CONTACTED'), true);
      assert.strictEqual(canTransitionLead('CONTACTED', 'QUALIFIED'), true);
      assert.strictEqual(canTransitionLead('QUALIFIED', 'PROPOSAL'), true);
      assert.strictEqual(canTransitionLead('PROPOSAL', 'NEGOTIATION'), true);
      assert.strictEqual(canTransitionLead('NEGOTIATION', 'WON'), true);
    });

    test('allows moving to LOST from any active stage with loss reason', () => {
      assert.strictEqual(canTransitionLead('NEW', 'LOST'), true);
      assert.strictEqual(canTransitionLead('CONTACTED', 'LOST'), true);
      assert.strictEqual(canTransitionLead('QUALIFIED', 'LOST'), true);
      assert.strictEqual(canTransitionLead('PROPOSAL', 'LOST'), true);
      assert.strictEqual(canTransitionLead('NEGOTIATION', 'LOST'), true);
    });

    test('REJECTS illegal jumps: NEW -> WON, NEW -> NEGOTIATION, CONTACTED -> WON', () => {
      assert.strictEqual(canTransitionLead('NEW', 'WON'), false);
      assert.strictEqual(canTransitionLead('NEW', 'NEGOTIATION'), false);
      assert.strictEqual(canTransitionLead('NEW', 'PROPOSAL'), false);
      assert.strictEqual(canTransitionLead('CONTACTED', 'WON'), false);
      assert.strictEqual(canTransitionLead('QUALIFIED', 'WON'), false);
    });

    test('REJECTS transitions out of terminal states (WON, LOST)', () => {
      assert.strictEqual(canTransitionLead('WON', 'NEGOTIATION'), false);
      assert.strictEqual(canTransitionLead('WON', 'LOST'), false);
      assert.strictEqual(canTransitionLead('WON', 'WON'), false);
      assert.strictEqual(canTransitionLead('LOST', 'WON'), false);
      assert.strictEqual(canTransitionLead('LOST', 'NEW'), false);
    });
  });

  describe('7. Stage-Specific Validation Rules', () => {
    test('NEW -> CONTACTED requires contactPerson, email or phone, and assigned salesperson', () => {
      // Missing contact method
      const res1 = validateContacted({ contactPerson: 'John', assignedSalesperson: '123' });
      assert.strictEqual(res1.isValid, false);

      // Valid
      const res2 = validateContacted({ contactPerson: 'John', email: 'john@co.com', assignedSalesperson: '123' });
      assert.strictEqual(res2.isValid, true);
    });

    test('CONTACTED -> QUALIFIED requires requirement, expectedValue > 0, next follow-up, assigned salesperson', () => {
      const res1 = validateQualification({ expectedValue: 0 });
      assert.strictEqual(res1.isValid, false);

      const res2 = validateQualification({
        requirement: 'Enterprise Cloud',
        expectedValue: 500000,
        nextFollowUpAt: new Date(),
        assignedSalesperson: '123',
      });
      assert.strictEqual(res2.isValid, true);
    });

    test('QUALIFIED -> PROPOSAL requires expectedValue > 0, productService, requirement, expectedClosingDate', () => {
      const res1 = validateProposal({ expectedValue: 500000 });
      assert.strictEqual(res1.isValid, false);

      const res2 = validateProposal({
        expectedValue: 500000,
        productService: 'SaaS Platform',
        requirement: 'CRM Upgrade',
        expectedClosingDate: new Date(),
      });
      assert.strictEqual(res2.isValid, true);
    });

    test('PROPOSAL -> NEGOTIATION requires proposal value > 0, expectedClosingDate, decisionMaker', () => {
      const res1 = validateNegotiation({ proposalValue: 0 });
      assert.strictEqual(res1.isValid, false);

      const res2 = validateNegotiation({
        proposalValue: 1000000,
        expectedClosingDate: new Date(),
        decisionMaker: 'VP Tech',
      });
      assert.strictEqual(res2.isValid, true);
    });

    test('NEGOTIATION -> WON requires finalDealValue > 0, companyName, productService, closingDate, assignedSalesperson', () => {
      const res1 = validateWon({ finalDealValue: 0 });
      assert.strictEqual(res1.isValid, false);

      const res2 = validateWon({
        companyName: 'Acme Corp',
        finalDealValue: 1800000,
        productService: 'Platform Suite',
        expectedClosingDate: new Date(),
        assignedSalesperson: '123',
      });
      assert.strictEqual(res2.isValid, true);
    });

    test('Transition to LOST requires valid lossReason', () => {
      const res1 = validateLost({ lossReason: null });
      assert.strictEqual(res1.isValid, false);

      const res2 = validateLost({ lossReason: 'PRICE' });
      assert.strictEqual(res2.isValid, true);

      const res3 = validateLost({ lossReason: 'INVALID_REASON' });
      assert.strictEqual(res3.isValid, false);
    });
  });

  describe('8. validateStatusTransition() Centralized Service', () => {
    test('returns LEAD_ALREADY_CLOSED when trying to transition a WON or LOST lead', () => {
      const res1 = validateStatusTransition('WON', 'WON', {});
      assert.strictEqual(res1.isValid, false);
      assert.strictEqual(res1.code, 'LEAD_ALREADY_CLOSED');

      const res2 = validateStatusTransition('LOST', 'WON', {});
      assert.strictEqual(res2.isValid, false);
      assert.strictEqual(res2.code, 'LEAD_ALREADY_CLOSED');
    });

    test('returns INVALID_STATUS_TRANSITION when jumping stages (NEW -> WON)', () => {
      const res = validateStatusTransition('NEW', 'WON', { companyName: 'Acme' });
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.code, 'INVALID_STATUS_TRANSITION');
    });
  });

  describe('9. Lead Quality Scoring Engine (Section 22)', () => {
    test('calculates advisory quality score between 0 and 100', () => {
      const lead = {
        contactPerson: 'Arun Kumar',
        email: 'arun@example.com',
        phone: '+91 9876543210',
        companyName: 'Tech Innovators',
        industry: 'Technology',
        location: { city: 'Bangalore' },
        source: 'REFERRAL',
        expectedValue: 2500000,
        nextFollowUpAt: new Date(),
        notes: 'High intent prospect evaluating enterprise licensing',
      };
      const result = calculateLeadQualityScore(lead);
      assert.ok(result.score >= 80 && result.score <= 100);
      assert.strictEqual(result.scoreVersion, '1.0.0');
      assert.ok(result.factors);
    });

    test('returns low score for sparse/incomplete lead', () => {
      const lead = {
        companyName: 'X',
        contactPerson: 'Y',
      };
      const result = calculateLeadQualityScore(lead);
      assert.ok(result.score < 30);
    });
  });

  describe('10. validateLead() Input Validator', () => {
    test('rejects empty, null, or whitespace-only company name', () => {
      const res1 = validateLead({ companyName: '   ', contactPerson: 'John' });
      assert.strictEqual(res1.isValid, false);
      assert.ok(res1.errors.some(e => e.field === 'companyName'));

      const res2 = validateLead({ companyName: null, contactPerson: 'John' });
      assert.strictEqual(res2.isValid, false);
    });

    test('rejects empty contact person', () => {
      const res = validateLead({ companyName: 'Acme', contactPerson: '' });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some(e => e.field === 'contactPerson'));
    });

    test('rejects negative expected value', () => {
      const res = validateLead({ companyName: 'Acme', contactPerson: 'John', expectedValue: -100 });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some(e => e.field === 'expectedValue'));
    });

    test('normalizes source and industry', () => {
      const res = validateLead({
        companyName: 'Acme',
        contactPerson: 'John',
        source: 'social media',
        industry: 'technology',
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.normalized.source, 'SOCIAL_MEDIA');
      assert.strictEqual(res.normalized.industry, 'Technology');
    });
  });

});
