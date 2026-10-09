const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');
const Salesperson = require('../src/models/Salesperson');
const Customer = require('../src/models/Customer');
const AuditLog = require('../src/models/AuditLog');

let salespersonA;
let salespersonB;
let adminUser;

before(async () => {
  await connectDB();

  await Customer.deleteMany({
    companyName: {
      $in: [
        'Vanguard Quantum Corp',
        'Duplicate Test Corp',
        'Stale Customer Corp',
        'Isolated Customer Corp',
      ],
    },
  });

  salespersonA = await Salesperson.findOne({ email: 'rahul@harvik.com' });
  salespersonB = await Salesperson.findOne({ email: 'sneha@harvik.com' });
  adminUser = await Salesperson.findOne({ systemRole: 'ADMIN' });
});

after(async () => {
  await Customer.deleteMany({
    companyName: {
      $in: [
        'Vanguard Quantum Corp',
        'Duplicate Test Corp',
        'Stale Customer Corp',
        'Isolated Customer Corp',
      ],
    },
  });
  await mongoose.disconnect();
});

describe('Customer Management Control Layer Integration & Negative Tests', () => {

  let testCustomerId;
  let testCustomerMongoId;

  describe('1. Customer Creation, Profile & Unique ID Generation', () => {
    test('POST /api/v1/customers creates customer with auto-generated unique customerId and audit trail', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Vanguard Quantum Corp',
          email: 'procurement@vanguardquantum.com',
          phone: '+91 9888877711',
          industry: 'Technology',
          status: 'Active',
          assignedSalesperson: salespersonA._id,
          address: {
            street: '42 Cyber City',
            city: 'Hyderabad',
            state: 'Telangana',
            country: 'India',
            pincode: '500081',
          },
          contactPersons: [
            {
              name: 'Dr. Anita Roy',
              title: 'Chief Information Officer',
              email: 'anita.roy@vanguardquantum.com',
              phone: '+91 9888877712',
              isPrimary: true,
            },
          ],
          productsPurchased: ['Enterprise Platform', 'Quantum API Gateway'],
          contractInfo: {
            contractNumber: 'CNT-2026-001',
            value: 3600000,
            startDate: '2026-01-01T00:00:00.000Z',
            endDate: '2026-12-31T23:59:59.000Z',
            renewalDate: '2026-11-30T00:00:00.000Z',
            status: 'Active',
            terms: '24/7 Premium SLA with dedicated technical account manager',
          },
          notes: 'High-value enterprise customer with multi-year roadmap',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.customerId);
      assert.match(res.body.data.customerId, /^CUST-\d{5}$/);
      assert.strictEqual(res.body.data.companyName, 'Vanguard Quantum Corp');
      assert.strictEqual(res.body.data.status, 'Active');
      assert.strictEqual(res.body.data.productsPurchased.length, 2);
      assert.strictEqual(res.body.data.contractInfo.contractNumber, 'CNT-2026-001');
      assert.strictEqual(res.body.data.contractInfo.value, 3600000);

      testCustomerId = res.body.data.customerId;
      testCustomerMongoId = res.body.data._id;

      // Verify audit trail
      const audit = await AuditLog.findOne({ entityId: testCustomerId, action: 'CUSTOMER_CREATED' });
      assert.ok(audit, 'AuditLog entry must be recorded for CUSTOMER_CREATED');
    });
  });

  describe('2. Customer Listing, Search, Filters & Retrieval', () => {
    test('GET /api/v1/customers returns paginated list with total count', async () => {
      const res = await request(app)
        .get('/api/v1/customers?page=1&limit=5')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.customers.length > 0);
      assert.ok(res.body.data.pagination.total > 0);
    });

    test('GET /api/v1/customers filters by status=Active', async () => {
      const res = await request(app)
        .get('/api/v1/customers?status=Active')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.customers.every(c => c.status === 'Active'));
    });

    test('GET /api/v1/customers/:id fetches single customer by business customerId', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.customerId, testCustomerId);
      assert.strictEqual(res.body.data.companyName, 'Vanguard Quantum Corp');
    });
  });

  describe('3. Customer Update & Concurrency Conflict Control', () => {
    test('PATCH /api/v1/customers/:id updates attributes and increments version', async () => {
      const getRes = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .set('x-dev-role', 'ADMIN');

      const currentVersion = getRes.body.data.version;

      const patchRes = await request(app)
        .patch(`/api/v1/customers/${testCustomerId}`)
        .set('x-dev-role', 'ADMIN')
        .send({
          version: currentVersion,
          notes: 'Updated account notes after quarterly review',
          'contractInfo.status': 'Active',
        });

      assert.strictEqual(patchRes.status, 200);
      assert.strictEqual(patchRes.body.data.version, currentVersion + 1);
      assert.strictEqual(patchRes.body.data.notes, 'Updated account notes after quarterly review');
    });

    test('Stale concurrent update returns 409 CUSTOMER_VERSION_CONFLICT', async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/customers/${testCustomerId}`)
        .set('x-dev-role', 'ADMIN')
        .send({
          version: 1, // Stale version
          notes: 'Stale concurrent update attempt',
        });

      assert.strictEqual(patchRes.status, 409);
      assert.strictEqual(patchRes.body.error.code, 'CUSTOMER_VERSION_CONFLICT');
    });
  });

  describe('4. Duplicate Customer Prevention & Authorized Override', () => {
    test('Duplicate company name is rejected with 409 POSSIBLE_DUPLICATE_CUSTOMER', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Vanguard Quantum Corp',
          email: 'different.email@vanguardquantum.com',
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'POSSIBLE_DUPLICATE_CUSTOMER');
      assert.strictEqual(res.body.data.existingCustomerId, testCustomerId);
    });

    test('Duplicate creation succeeds when allowDuplicate flag is provided', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Duplicate Test Corp',
          email: 'dup@testcorp.com',
          allowDuplicate: true,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
    });
  });

  describe('5. Salesperson Assignment & Data Isolation (RBAC)', () => {
    test('PATCH /api/v1/customers/:id/assignment allows ADMIN to reassign customer', async () => {
      const res = await request(app)
        .patch(`/api/v1/customers/${testCustomerId}/assignment`)
        .set('x-dev-role', 'ADMIN')
        .send({
          salespersonId: salespersonB._id,
          reason: 'Strategic territory restructuring',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.assignedSalesperson, String(salespersonB._id));

      // Verify audit log
      const audit = await AuditLog.findOne({ entityId: testCustomerId, action: 'CUSTOMER_REASSIGNED' });
      assert.ok(audit, 'AuditLog entry must be recorded for CUSTOMER_REASSIGNED');
    });

    test('Salesperson assignment is rejected (403 FORBIDDEN) if initiated by SALESPERSON', async () => {
      const res = await request(app)
        .patch(`/api/v1/customers/${testCustomerId}/assignment`)
        .set('x-dev-role', 'SALESPERSON')
        .send({
          salespersonId: salespersonA._id,
        });

      assert.strictEqual(res.status, 403);
    });

    test('Salesperson data isolation restricts SALESPERSON query to their assigned customers only', async () => {
      const res = await request(app)
        .get('/api/v1/customers')
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonB._id));

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.customers.length > 0);
      assert.ok(res.body.data.customers.every(c => String(c.assignedSalesperson?._id || c.assignedSalesperson) === String(salespersonB._id)));
    });

    test('Salesperson data isolation blocks access (403 FORBIDDEN) to another salesperson customer', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonA._id)); // testCustomer is assigned to salespersonB

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });

  describe('6. Customer Portfolio & Contract Analytics', () => {
    test('GET /api/v1/customers/stats returns portfolio metrics and upcoming renewals', async () => {
      const res = await request(app)
        .get('/api/v1/customers/stats')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.totalCustomers > 0);
      assert.ok(typeof res.body.data.activeCustomers === 'number');
      assert.ok(typeof res.body.data.totalRevenue === 'number');
      assert.ok(typeof res.body.data.upcomingRenewals === 'number');
    });
  });

});
