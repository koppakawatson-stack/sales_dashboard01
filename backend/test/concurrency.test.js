const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');

const Deal = require('../src/models/Deal');
const Revenue = require('../src/models/Revenue');
const Customer = require('../src/models/Customer');
const Salesperson = require('../src/models/Salesperson');
const Lead = require('../src/models/Lead');

before(async () => {
  await connectDB();
});

after(async () => {
  await mongoose.disconnect();
});

describe('Concurrency, Race Condition & Idempotency Tests (Section 17)', () => {

  test('Scenario A: Parallel WON requests on same deal produce exactly 1 revenue record', async () => {
    // 1. Setup customer and salesperson
    const customer = await Customer.findOne() || await Customer.create({
      companyName: 'Concurrency Test Corp',
      email: 'concurrent@corp.com',
    });
    const salesperson = await Salesperson.findOne({ systemRole: 'ADMIN' });

    // 2. Create an active negotiation deal
    const deal = await Deal.create({
      dealId: `DEAL-CONC-${Date.now()}`,
      opportunityName: 'Concurrency Deal Test',
      customer: customer._id,
      salesperson: salesperson._id,
      productService: 'Cloud Platform',
      expectedClosingDate: new Date(),
      dealValue: 750000,
      stage: 'Negotiation',
      probability: 80,
      version: 1,
    });

    const initialRevCount = await Revenue.countDocuments({ deal: deal._id });
    assert.strictEqual(initialRevCount, 0);

    // 3. Execute 2 simultaneous requests to mark the deal as Won
    const [res1, res2] = await Promise.all([
      request(app)
        .patch(`/api/v1/deals/${deal.dealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Won', version: 1 }),
      request(app)
        .patch(`/api/v1/deals/${deal.dealId}/stage`)
        .set('x-dev-role', 'ADMIN')
        .send({ stage: 'Won', version: 1 }),
    ]);

    // One must succeed (200), second will either succeed idempotently or return conflict/closed (200/400/409)
    const statuses = [res1.status, res2.status];
    assert.ok(statuses.includes(200));

    // CRITICAL INVARIANT: Exactly 1 revenue document must be created in MongoDB
    const finalRevCount = await Revenue.countDocuments({ deal: deal._id });
    assert.strictEqual(finalRevCount, 1, 'Exactly one recognized revenue document must be generated');

    // Cleanup
    await Revenue.deleteMany({ deal: deal._id });
    await Deal.deleteOne({ _id: deal._id });
  });

  test('Scenario B: Stale concurrent mutation triggers 409 Conflict', async () => {
    const lead = await Lead.create({
      companyName: 'Version Conflict Corp',
      contactPerson: 'Suresh Kumar',
      email: `ver-${Date.now()}@corp.com`,
      version: 5,
    });

    // Attempt update with outdated version 3
    const res = await request(app)
      .patch(`/api/v1/leads/${lead.leadId}`)
      .set('x-dev-role', 'ADMIN')
      .send({
        companyName: 'Version Conflict Updated',
        version: 3,
      });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error.code, 'LEAD_VERSION_CONFLICT');

    await Lead.deleteOne({ _id: lead._id });
  });

  test('Scenario C: Duplicate lead submission returns 409 unless allowDuplicate is specified', async () => {
    const testEmail = `duplicate-${Date.now()}@testcorp.com`;
    const payload = {
      companyName: 'Duplicate Test Corp',
      contactPerson: 'Karan Mehra',
      email: testEmail,
      source: 'Website',
      status: 'NEW',
    };

    // First submission
    const res1 = await request(app)
      .post('/api/v1/leads')
      .set('x-dev-role', 'ADMIN')
      .send(payload);
    assert.strictEqual(res1.status, 201);

    // Second submission with exact same company and email
    const res2 = await request(app)
      .post('/api/v1/leads')
      .set('x-dev-role', 'ADMIN')
      .send(payload);
    assert.strictEqual(res2.status, 409);
    assert.strictEqual(res2.body.error.code, 'POSSIBLE_DUPLICATE_LEAD');

    // Cleanup
    await Lead.deleteMany({ email: testEmail });
  });

});
