const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCompanyName,
  validateEmail,
  validatePhone,
  normalizeIndustry,
  normalizeCustomerStatus,
  validateContractInfo,
  isRenewalUpcoming,
  isContractExpired,
  validateCustomer,
} = require('../src/utils/customerValidator');

describe('Customer Management Pure Validation Controls', () => {

  describe('1. validateCompanyName()', () => {
    test('accepts valid company name', () => {
      assert.strictEqual(validateCompanyName('Harvik Technologies Pvt Ltd'), true);
    });

    test('rejects empty, null, or whitespace-only name', () => {
      assert.strictEqual(validateCompanyName(''), false);
      assert.strictEqual(validateCompanyName('   '), false);
      assert.strictEqual(validateCompanyName(null), false);
      assert.strictEqual(validateCompanyName(undefined), false);
    });
  });

  describe('2. validateEmail()', () => {
    test('normalizes valid email to lowercase', () => {
      const res = validateEmail('Billing@AcmeCorp.COM');
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.email, 'billing@acmecorp.com');
    });

    test('rejects malformed email', () => {
      const res = validateEmail('invalid-email-address');
      assert.strictEqual(res.isValid, false);
      assert.ok(res.error);
    });

    test('accepts empty/null email as optional', () => {
      assert.strictEqual(validateEmail(null).isValid, true);
      assert.strictEqual(validateEmail('').isValid, true);
    });
  });

  describe('3. validatePhone()', () => {
    test('accepts international and local phone formats', () => {
      assert.strictEqual(validatePhone('+91 9876543210').isValid, true);
      assert.strictEqual(validatePhone('022-12345678').isValid, true);
    });

    test('rejects phone numbers with too few digits', () => {
      assert.strictEqual(validatePhone('1234').isValid, false);
    });
  });

  describe('4. normalizeIndustry() & normalizeCustomerStatus()', () => {
    test('normalizes valid industries', () => {
      assert.strictEqual(normalizeIndustry('technology'), 'Technology');
      assert.strictEqual(normalizeIndustry('HEALTHCARE'), 'Healthcare');
      assert.strictEqual(normalizeIndustry('Unknown'), 'Other');
    });

    test('normalizes customer statuses', () => {
      assert.strictEqual(normalizeCustomerStatus('active'), 'Active');
      assert.strictEqual(normalizeCustomerStatus('PROSPECT'), 'Prospect');
      assert.strictEqual(normalizeCustomerStatus('churned'), 'Churned');
      assert.strictEqual(normalizeCustomerStatus('invalid'), 'Active');
    });
  });

  describe('5. validateContractInfo()', () => {
    test('accepts valid contract info', () => {
      const res = validateContractInfo({
        contractNumber: 'CNT-2026-001',
        value: 1500000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        status: 'Active',
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.data.value, 1500000);
      assert.strictEqual(res.data.status, 'Active');
    });

    test('rejects negative contract value', () => {
      const res = validateContractInfo({ value: -50000 });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some(e => e.includes('non-negative')));
    });

    test('rejects end date before start date', () => {
      const res = validateContractInfo({
        startDate: '2026-12-31',
        endDate: '2026-01-01',
      });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some(e => e.includes('start date')));
    });
  });

  describe('6. isRenewalUpcoming() & isContractExpired()', () => {
    test('detects renewal due within 30 days', () => {
      const inFifteenDays = new Date(Date.now() + 15 * 86400000).toISOString();
      assert.strictEqual(isRenewalUpcoming(inFifteenDays, 30), true);
    });

    test('does not flag renewal far in the future', () => {
      const inSixtyDays = new Date(Date.now() + 60 * 86400000).toISOString();
      assert.strictEqual(isRenewalUpcoming(inSixtyDays, 30), false);
    });

    test('identifies past end date as expired', () => {
      const pastDate = new Date(Date.now() - 5 * 86400000).toISOString();
      assert.strictEqual(isContractExpired(pastDate), true);
    });
  });

  describe('7. validateCustomer() Comprehensive Validator', () => {
    test('validates and sanitizes a complete customer record', () => {
      const res = validateCustomer({
        companyName: '  Zenith Aerospace  ',
        email: 'Procurement@Zenith.AERO  ',
        phone: '+91 9988776655',
        industry: 'technology',
        status: 'active',
        contactPersons: [
          { name: 'Dr. V. Rao', email: 'v.rao@zenith.aero', isPrimary: true },
        ],
        contractInfo: {
          contractNumber: 'CNT-2026-099',
          value: '2500000',
          status: 'active',
        },
        notes: 'Strategic account',
      });

      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.data.companyName, 'Zenith Aerospace');
      assert.strictEqual(res.data.email, 'procurement@zenith.aero');
      assert.strictEqual(res.data.industry, 'Technology');
      assert.strictEqual(res.data.contractInfo.value, 2500000);
    });

    test('rejects customer missing company name', () => {
      const res = validateCustomer({ email: 'test@company.com' });
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors.some(e => e.includes('Company name is required')));
    });
  });

});
