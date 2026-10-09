const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');

const Deal = require('../src/models/Deal');
const Revenue = require('../src/models/Revenue');
const Customer = require('../src/models/Customer');
const Lead = require('../src/models/Lead');

before(async () => {
  await connectDB();
  const apexDeals = await Deal.find({ opportunityName: /Apex Robotics/i }).select('_id');
  if (apexDeals.length > 0) {
    const dealIds = apexDeals.map(d => d._id);
    await Revenue.deleteMany({ deal: { $in: dealIds } });
    await Deal.deleteMany({ _id: { $in: dealIds } });
    await Customer.deleteMany({ companyName: 'Apex Robotics Pvt Ltd' });
  }
  await Lead.deleteMany({
    companyName: {
      $in: [
        'Apex Robotics Pvt Ltd',
        'Lost Path Dynamics',
        'Jump Test Corp',
        'Negative Value Test',
        'Bad Email Co',
        'Archive Test Corp',
      ],
    },
  });
});

after(async () => {
  await mongoose.disconnect();
});

describe('Sales Overview API & Control Layer Integration Tests', () => {

  describe('1. Normal Case & Realistic Metrics (Section 25)', () => {
    test('GET /api/v1/dashboard/overview returns status 200 with all 13 metrics', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview?period=MONTH&year=2026&month=10')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      const body = res.body;

      assert.strictEqual(body.success, true);
      assert.ok(body.data);
      assert.ok(body.data.period);
      assert.strictEqual(body.data.period.type, 'MONTH');

      const m = body.data.metrics;
      assert.ok(m, 'Metrics object must be present');
      // Metric 1: Total Leads
      assert.strictEqual(typeof m.totalLeads, 'number');
      assert.ok(m.totalLeads >= 7);
      // Metric 2: New Leads
      assert.strictEqual(typeof m.newLeads, 'number');
      // Metric 3: Qualified Leads
      assert.strictEqual(typeof m.qualifiedLeads, 'number');
      // Metric 4: Active Opportunities
      assert.strictEqual(typeof m.activeOpportunities, 'number');
      // Metric 5: Won Deals
      assert.strictEqual(typeof m.wonDeals, 'number');
      // Metric 6: Lost Deals
      assert.strictEqual(typeof m.lostDeals, 'number');
      // Metric 7: Total Pipeline Value & Weighted
      assert.strictEqual(typeof m.pipelineValue, 'number');
      assert.strictEqual(typeof m.weightedPipelineValue, 'number');
      // Metric 8: Won Revenue
      assert.strictEqual(typeof m.wonRevenue, 'number');
      // Metric 9: Monthly Revenue
      assert.strictEqual(typeof m.monthlyRevenue, 'number');
      // Metric 10: Monthly Target
      assert.strictEqual(typeof m.monthlyTarget, 'number');
      // Metric 11: Target Achievement
      assert.strictEqual(typeof m.targetAchievement, 'number');
      assert.ok(Number.isFinite(m.targetAchievement));
      // Metric 12: Conversion Rate
      assert.strictEqual(typeof m.conversionRate, 'number');
      assert.ok(Number.isFinite(m.conversionRate));

      // Metric 13: Salesperson Performance
      assert.ok(Array.isArray(body.data.salespersonPerformance));
      assert.ok(body.data.salespersonPerformance.length >= 2);
    });
  });

  describe('2. Pipeline Excludes Won & Lost Deals (Section 7, 10, 25)', () => {
    test('Pipeline value correctly excludes Scenario D (Lost ₹6L) and Scenario E (Won ₹12L)', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview?period=ALL')
        .set('x-dev-role', 'ADMIN');

      const body = res.body;
      const m = body.data.metrics;

      // Active deals in seeded scenarios:
      // TechNova: 1,800,000 (Negotiation)
      // ABC Solutions: 850,000 (Proposal)
      // Global Systems: 2,500,000 (Negotiation)
      // Apex Cloud: 500,000 (Proposal)
      // Prime Logistics: 600,000 (Qualified)
      // Total active pipeline = 6,250,000
      assert.strictEqual(m.pipelineValue, 6250000);
      assert.strictEqual(m.activeOpportunities, 5);
      assert.strictEqual(m.wonDeals, 2);
      assert.strictEqual(m.lostDeals, 1);
    });
  });

  describe('3. Revenue Comes from Valid Revenue Records (Section 11, 12)', () => {
    test('Won revenue matches recognized revenue records, not all deals', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview?period=ALL')
        .set('x-dev-role', 'ADMIN');

      const body = res.body;
      const m = body.data.metrics;

      const validRevenues = await Revenue.find({ status: { $in: ['Paid', 'Valid'] } });
      const expectedSum = validRevenues.reduce((s, r) => s + r.amount, 0);
      assert.strictEqual(m.wonRevenue, expectedSum);
    });
  });

  describe('4. Zero / Empty Cases & Safe Handling (Section 14, 15, 25)', () => {
    test('Non-matching filter returns safe zero metrics without NaN or Infinity', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview?period=MONTH&industry=NonExistentIndustryXYZ')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      const body = res.body;

      const m = body.data.metrics;
      assert.strictEqual(m.totalLeads, 0);
      assert.strictEqual(m.qualifiedLeads, 0);
      assert.strictEqual(m.wonDeals, 0);
      assert.strictEqual(m.pipelineValue, 0);
      assert.strictEqual(m.targetAchievement, 0);
      assert.strictEqual(m.conversionRate, 0);
      assert.ok(!Number.isNaN(m.targetAchievement));
      assert.ok(!Number.isNaN(m.conversionRate));
      assert.ok(Number.isFinite(m.targetAchievement));
      assert.ok(Number.isFinite(m.conversionRate));
    });
  });

  describe('5. Salesperson Performance Separation & Sorting (Section 16, 25)', () => {
    test('Correctly separates performance for Rahul Mehta vs Sneha Reddy and supports sorting', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview?period=ALL&sortBy=revenue&sortOrder=desc')
        .set('x-dev-role', 'ADMIN');

      const body = res.body;
      const list = body.data.salespersonPerformance;

      assert.ok(list.length >= 2);
      const rahul = list.find(s => s.name === 'Rahul Mehta');
      const sneha = list.find(s => s.name === 'Sneha Reddy');

      assert.ok(rahul, 'Rahul Mehta must exist in performance list');
      assert.ok(sneha, 'Sneha Reddy must exist in performance list');

      // Rahul Mehta: Target ₹800,000, Revenue ₹1,500,000 -> Achievement 187.5%
      assert.strictEqual(rahul.target, 800000);
      assert.strictEqual(rahul.wonRevenue, 1500000);
      assert.strictEqual(rahul.achievement, 187.5);

      // Sneha Reddy: Target ₹750,000, Revenue ₹100,000 -> Achievement 13.3%
      assert.strictEqual(sneha.target, 750000);
      assert.strictEqual(sneha.wonRevenue, 100000);
      assert.strictEqual(sneha.achievement, 13.3);

      // Sorted by revenue descending -> Rahul first
      assert.strictEqual(list[0].salespersonId, rahul.salespersonId);
    });
  });

  describe('6. Role Scoping & Authorization (Section 21, 25)', () => {
    test('SALESPERSON role restricts view to their own records only', async () => {
      const allRes = await request(app)
        .get('/api/v1/dashboard/overview?period=ALL')
        .set('x-dev-role', 'ADMIN');

      const rahul = allRes.body.data.salespersonPerformance.find(s => s.name === 'Rahul Mehta');
      assert.ok(rahul);

      const spRes = await request(app)
        .get('/api/v1/dashboard/overview?period=ALL')
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', rahul.salespersonId);

      assert.strictEqual(spRes.status, 200);
      const spBody = spRes.body;

      // Rahul only sees his deals and revenue (₹1,500,000, not ₹2,550,000 total)
      assert.strictEqual(spBody.data.metrics.wonRevenue, 1500000);
      assert.strictEqual(spBody.data.salespersonPerformance.length, 1);
      assert.strictEqual(spBody.data.salespersonPerformance[0].salespersonId, rahul.salespersonId);
    });

    test('Strict auth without credentials returns 401 AUTH_REQUIRED', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('x-require-strict-auth', 'true');

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'AUTH_REQUIRED');
    });

    test('Unauthorized access to reconciliation endpoint returns 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview/reconciliation')
        .set('x-dev-role', 'SALESPERSON');

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });

  describe('7. Redis 7 Caching & Performance (Section 20, 27)', () => {
    test('Subsequent request serves from Redis cache with response time < 500ms', async () => {
      const cacheTestUrl = '/api/v1/dashboard/overview?period=MONTH&year=2026&month=10&testKey=redisPerfTest';
      // First request primes cache
      const start1 = Date.now();
      const res1 = await request(app).get(cacheTestUrl).set('x-dev-role', 'ADMIN');
      const time1 = Date.now() - start1;
      assert.strictEqual(res1.status, 200);

      // Second request
      const start2 = Date.now();
      const res2 = await request(app).get(cacheTestUrl).set('x-dev-role', 'ADMIN');
      const time2 = Date.now() - start2;
      assert.strictEqual(res2.status, 200);
      assert.ok(time2 < 500, `Response duration was ${time2}ms, expected < 500ms`);
    });
  });

  describe('8. Independent Reconciliation Endpoint (Section 24)', () => {
    test('GET /api/v1/dashboard/overview/reconciliation returns PASS for all 5 audit checks', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview/reconciliation?period=ALL')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      const body = res.body;

      assert.strictEqual(body.status, 'PASS');
      assert.ok(body.checks);
      assert.strictEqual(body.checks.pipelineMatchesOpportunities, true);
      assert.strictEqual(body.checks.revenueMatchesRevenueRecords, true);
      assert.strictEqual(body.checks.targetMatchesTargetCollection, true);
      assert.strictEqual(body.checks.wonDealsMatchOpportunityState, true);
      assert.strictEqual(body.checks.conversionCalculationValid, true);
    });
  });

  describe('9. Duplicate WON Request Idempotency & Data Integrity (Section 11, 23, 25)', () => {
    test('Transitioning deal to WON multiple times does not produce duplicate revenue records', async () => {
      const dealsRes = await request(app)
        .get('/api/v1/deals?stage=Won')
        .set('x-dev-role', 'ADMIN');

      const dealsBody = dealsRes.body;
      assert.ok(dealsBody.deals && dealsBody.deals.length > 0, 'Must have at least one Won deal');
      const wonDeal = dealsBody.deals[0];

      const patchRes = await request(app)
        .put(`/api/v1/deals/${wonDeal._id}`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Won' });

      assert.ok(patchRes.status === 200 || patchRes.status === 204);

      const reconRes = await request(app)
        .get('/api/v1/dashboard/overview/reconciliation?period=ALL')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(reconRes.status, 200);
      assert.strictEqual(reconRes.body.status, 'PASS');
      assert.strictEqual(reconRes.body.checks.revenueMatchesRevenueRecords, true);
    });
  });

});
