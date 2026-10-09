const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');
const Salesperson = require('../src/models/Salesperson');
const Customer = require('../src/models/Customer');
const Deal = require('../src/models/Deal');
const Revenue = require('../src/models/Revenue');
const AuditLog = require('../src/models/AuditLog');

let salespersonA;
let salespersonB;
let adminUser;
let testCustomer;

const cleanupTestData = async () => {
  const testDeals = await Deal.find({
    opportunityName: {
      $in: [
        'Integration Test Enterprise Platform',
        'State Machine Opportunity',
        'Isolated Deal Rep A',
        'Stale Version Deal',
        'Won Lifecycle Deal',
      ],
    },
  });
  const dealIds = testDeals.map(d => d._id);
  await Revenue.deleteMany({ deal: { $in: dealIds } });
  await Deal.deleteMany({ _id: { $in: dealIds } });
};

before(async () => {
  await connectDB();
  await cleanupTestData();

  salespersonA = await Salesperson.findOne({ email: 'rahul@harvik.com' });
  salespersonB = await Salesperson.findOne({ email: 'sneha@harvik.com' });
  adminUser = await Salesperson.findOne({ systemRole: 'ADMIN' });
  testCustomer = await Customer.findOne({ companyName: 'TechNova Pvt Ltd' });
});

after(async () => {
  await cleanupTestData();
  await mongoose.disconnect();
});

describe('Deal / Opportunity Management Control Layer Integration & Negative Tests', () => {

  let testDealId;
  let testDealMongoId;

  describe('1. Deal Creation, Auto-ID & Weighted Value', () => {
    test('POST /api/v1/deals creates opportunity with auto-generated DEAL-0000X format', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set('x-dev-role', 'ADMIN')
        .send({
          opportunityName: 'Integration Test Enterprise Platform',
          customer: testCustomer._id,
          salesperson: salespersonA._id,
          productService: 'Cloud Architecture Suite',
          dealValue: 2000000,
          probability: 60,
          stage: 'Proposal',
          expectedClosingDate: '2026-12-15',
          notes: 'High-intent enterprise opportunity.',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.dealId);
      assert.match(res.body.dealId, /^DEAL-\d{5}$/);
      assert.strictEqual(res.body.opportunityName, 'Integration Test Enterprise Platform');
      assert.strictEqual(res.body.dealValue, 2000000);
      assert.strictEqual(res.body.weightedValue, 1200000); // 2,000,000 * 60%
      assert.strictEqual(res.body.stage, 'Proposal');

      testDealId = res.body.dealId;
      testDealMongoId = res.body._id;

      // Verify Audit Log
      const audit = await AuditLog.findOne({
        action: 'OPPORTUNITY_CREATED',
        entityId: testDealId,
      });
      assert.ok(audit, 'Audit log entry must be created on opportunity creation');
    });

    test('POST /api/v1/deals rejects negative deal value (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set('x-dev-role', 'ADMIN')
        .send({
          opportunityName: 'Invalid Negative Deal',
          customer: testCustomer._id,
          salesperson: salespersonA._id,
          productService: 'CRM',
          dealValue: -150000,
          expectedClosingDate: '2026-12-31',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('2. Deal Listing, Search, Filters & Retrieval', () => {
    test('GET /api/v1/deals returns paginated list with total count and populated references', async () => {
      const res = await request(app)
        .get('/api/v1/deals?page=1&limit=5')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.deals.length > 0);
      assert.ok(res.body.data.pagination.total > 0);
      assert.ok(res.body.data.deals[0].salesperson.name, 'Salesperson reference must be populated');
      assert.ok(res.body.data.deals[0].customer.companyName, 'Customer reference must be populated');
    });

    test('GET /api/v1/deals/:id fetches opportunity by business dealId (DEAL-XXXXX)', async () => {
      const res = await request(app)
        .get(`/api/v1/deals/${testDealId}`)
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.dealId, testDealId);
      assert.strictEqual(res.body.opportunityName, 'Integration Test Enterprise Platform');
    });
  });

  describe('3. Stage Lifecycle State Machine & Negative Tests', () => {
    let stateDealId;

    test('Creates opportunity at Lead stage', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set('x-dev-role', 'ADMIN')
        .send({
          opportunityName: 'State Machine Opportunity',
          customer: testCustomer._id,
          salesperson: salespersonA._id,
          productService: 'Telemetry Hub',
          dealValue: 1500000,
          stage: 'Lead',
          expectedClosingDate: '2026-11-20',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.stage, 'Lead');
      stateDealId = res.body.dealId;
    });

    test('REJECTS illegal jump: Lead -> Won (400 INVALID_STAGE_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/deals/${stateDealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Won' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_STAGE_TRANSITION');
    });

    test('REJECTS transition to Lost without lostReason (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .patch(`/api/v1/deals/${stateDealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Lost' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('Sequential valid advancement: Lead -> Qualified -> Proposal -> Negotiation', async () => {
      // Advance to Qualified
      const res1 = await request(app)
        .patch(`/api/v1/deals/${stateDealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Qualified' });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.body.data.stage, 'Qualified');
      assert.strictEqual(res1.body.data.probability, 40);

      // Advance to Proposal
      const res2 = await request(app)
        .patch(`/api/v1/deals/${stateDealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Proposal' });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.body.data.stage, 'Proposal');

      // Advance to Negotiation
      const res3 = await request(app)
        .patch(`/api/v1/deals/${stateDealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Negotiation' });
      assert.strictEqual(res3.status, 200);
      assert.strictEqual(res3.body.data.stage, 'Negotiation');
      assert.strictEqual(res3.body.data.probability, 80);
    });

    test('Transition to Won books Revenue automatically and sets probability to 100', async () => {
      const res = await request(app)
        .patch(`/api/v1/deals/${stateDealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Won' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.stage, 'Won');
      assert.strictEqual(res.body.data.probability, 100);
      assert.strictEqual(res.body.data.weightedValue, 1500000);
      assert.ok(res.body.data.wonAt);

      // Verify Revenue record was automatically created
      const rev = await Revenue.findOne({ deal: res.body.data._id });
      assert.ok(rev, 'Revenue record must be created when opportunity is Won');
      assert.strictEqual(rev.amount, 1500000);
      assert.strictEqual(rev.status, 'Paid');

      // Verify Opportunity Won audit
      const audit = await AuditLog.findOne({
        action: 'OPPORTUNITY_WON',
        entityId: stateDealId,
      });
      assert.ok(audit, 'OPPORTUNITY_WON audit log must exist');
    });

    test('REJECTS modifying already-Won deal back to an active stage', async () => {
      const res = await request(app)
        .patch(`/api/v1/deals/${stateDealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Negotiation' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'INVALID_STAGE_TRANSITION');
    });
  });

  describe('4. Optimistic Concurrency Control', () => {
    test('Stale concurrent update returns 409 DEAL_VERSION_CONFLICT', async () => {
      const deal = await Deal.findOne({ dealId: testDealId });
      assert.ok(deal);

      const res = await request(app)
        .patch(`/api/v1/deals/${testDealId}`)
        .set('x-dev-role', 'ADMIN')
        .send({
          opportunityName: 'Conflict Version Update',
          version: deal.version + 99, // Stale version
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'DEAL_VERSION_CONFLICT');
    });
  });

  describe('5. Salesperson Assignment & Data Isolation (Req #19)', () => {
    test('PATCH /api/v1/deals/:id/assignment allows ADMIN to reassign opportunity', async () => {
      const res = await request(app)
        .patch(`/api/v1/deals/${testDealId}/assignment`)
        .set('x-dev-role', 'ADMIN')
        .send({
          salespersonId: salespersonB._id,
          reason: 'Strategic territory adjustment',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(String(res.body.data.salesperson._id), String(salespersonB._id));

      const audit = await AuditLog.findOne({
        action: 'OPPORTUNITY_REASSIGNED',
        entityId: testDealId,
      });
      assert.ok(audit);
    });

    test('Salesperson assignment is rejected (403 FORBIDDEN) if initiated by SALESPERSON role', async () => {
      const res = await request(app)
        .patch(`/api/v1/deals/${testDealId}/assignment`)
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonB._id))
        .send({
          salespersonId: salespersonA._id,
        });

      assert.strictEqual(res.status, 403);
    });

    test('Salesperson query only returns their assigned opportunities', async () => {
      const res = await request(app)
        .get('/api/v1/deals')
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonA._id));

      assert.strictEqual(res.status, 200);
      res.body.data.deals.forEach(d => {
        assert.strictEqual(String(d.salesperson._id), String(salespersonA._id));
      });
    });

    test('Salesperson cannot view another salesperson opportunity (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/v1/deals/${testDealId}`) // Assigned to salespersonB
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonA._id)); // Accessing as salespersonA

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });

  describe('6. Pipeline Statistics & Summary', () => {
    test('GET /api/v1/deals/stats returns pipeline totals and stage breakdown', async () => {
      const res = await request(app)
        .get('/api/v1/deals/stats')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.totalDeals >= 5);
      assert.ok(res.body.data.stageBreakdown.Lead !== undefined);
      assert.ok(res.body.data.stageBreakdown.Qualified !== undefined);
      assert.ok(res.body.data.stageBreakdown.Proposal !== undefined);
      assert.ok(res.body.data.stageBreakdown.Negotiation !== undefined);
      assert.ok(res.body.data.stageBreakdown.Won !== undefined);
      assert.ok(res.body.data.stageBreakdown.Lost !== undefined);
    });
  });
});
