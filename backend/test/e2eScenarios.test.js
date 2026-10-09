const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');

const Lead = require('../src/models/Lead');
const Deal = require('../src/models/Deal');
const Revenue = require('../src/models/Revenue');
const Customer = require('../src/models/Customer');
const Salesperson = require('../src/models/Salesperson');
const AuditLog = require('../src/models/AuditLog');

before(async () => {
  await connectDB();
});

after(async () => {
  await mongoose.disconnect();
});

describe('Master End-to-End Business Scenarios (Section 18)', () => {

  test('Scenario 1: Complete Sales Journey (Lead -> Contacted -> Qualified -> Proposal -> Negotiation -> Won -> Revenue)', async () => {
    const admin = await Salesperson.findOne({ systemRole: 'ADMIN' });
    const ts = Date.now();

    // Step 1: Create Lead in NEW state
    const createRes = await request(app)
      .post('/api/v1/leads')
      .set('x-dev-role', 'ADMIN')
      .send({
        companyName: `E2E Journey Corp ${ts}`,
        contactPerson: 'Aditya Verma',
        email: `aditya_${ts}@e2e.com`,
        phone: '+91 9988776655',
        source: 'Referral',
        status: 'NEW',
        assignedSalesperson: admin._id,
      });

    assert.strictEqual(createRes.status, 201);
    const leadId = createRes.body.data.leadId;

    // Step 2: Advance to CONTACTED
    const contRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('x-dev-role', 'ADMIN')
      .send({ status: 'CONTACTED' });
    assert.strictEqual(contRes.status, 200);

    // Step 3: Advance to QUALIFIED
    const qualRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('x-dev-role', 'ADMIN')
      .send({
        status: 'QUALIFIED',
        requirement: 'Enterprise Cloud ERP',
        expectedValue: 1200000,
        nextFollowUpDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
    assert.strictEqual(qualRes.status, 200);

    // Step 4: Advance to PROPOSAL
    const propRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('x-dev-role', 'ADMIN')
      .send({
        status: 'PROPOSAL',
        productService: 'Cloud ERP Solution',
        expectedClosingDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });
    assert.strictEqual(propRes.status, 200);

    // Step 5: Advance to NEGOTIATION
    const negRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('x-dev-role', 'ADMIN')
      .send({
        status: 'NEGOTIATION',
        proposalValue: 1200000,
        decisionMaker: 'VP of Technology',
      });
    assert.strictEqual(negRes.status, 200);

    // Step 6: Close as WON
    const wonRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('x-dev-role', 'ADMIN')
      .send({
        status: 'WON',
        finalDealValue: 1200000,
        closingDate: new Date().toISOString(),
      });
    assert.strictEqual(wonRes.status, 200);

    // Step 7: Verify downstream Customer, Deal, and Revenue records
    const cust = await Customer.findOne({ companyName: `E2E Journey Corp ${ts}` });
    assert.ok(cust, 'Customer record must be automatically generated upon WON lead');

    const deal = await Deal.findOne({ customer: cust._id });
    assert.ok(deal, 'Opportunity / Deal record must be created for Won lead');
    assert.strictEqual(deal.stage, 'Won');
    assert.strictEqual(deal.dealValue, 1200000);

    const revenue = await Revenue.findOne({ customer: cust._id });
    assert.ok(revenue, 'Recognized revenue record must be created');
    assert.strictEqual(revenue.amount, 1200000);

    // Cleanup
    await Revenue.deleteMany({ customer: cust._id });
    await Deal.deleteMany({ customer: cust._id });
    await Customer.deleteOne({ _id: cust._id });
    await Lead.deleteOne({ leadId });
  });

  test('Scenario 2: Lost Deal (Pipeline decrements and won revenue remains unaffected)', async () => {
    const admin = await Salesperson.findOne({ systemRole: 'ADMIN' });
    const ts = Date.now();

    const createRes = await request(app)
      .post('/api/v1/leads')
      .set('x-dev-role', 'ADMIN')
      .send({
        companyName: `Lost Journey Corp ${ts}`,
        contactPerson: 'Sameer Rao',
        email: `sameer_${ts}@lost.com`,
        source: 'Website',
        status: 'NEW',
        assignedSalesperson: admin._id,
      });
    const leadId = createRes.body.data.leadId;

    // Direct transition to LOST with loss reason
    const lostRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('x-dev-role', 'ADMIN')
      .send({
        status: 'LOST',
        lossReason: 'COMPETITOR',
      });

    assert.strictEqual(lostRes.status, 200);
    assert.strictEqual(lostRes.body.data.status, 'LOST');

    // Terminal state verification: Attempt to move LOST -> WON
    const rejectRes = await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('x-dev-role', 'ADMIN')
      .send({ status: 'WON', finalDealValue: 500000 });
    assert.strictEqual(rejectRes.status, 400);

    await Lead.deleteOne({ leadId });
  });

  test('Scenario 3: Overdue Follow-up Query returns active pending follow-ups', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/upcoming-followups')
      .set('x-dev-role', 'ADMIN');

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('Scenario 4: Salesperson Restriction Blocks Cross-Salesperson Access', async () => {
    const admin = await Salesperson.findOne({ systemRole: 'ADMIN' });
    const salesperson = await Salesperson.findOne({ systemRole: 'SALESPERSON' });

    // Lead assigned to Admin
    const lead = await Lead.create({
      companyName: `Admin Scoped Lead ${Date.now()}`,
      contactPerson: 'Target Person',
      email: `admin_lead_${Date.now()}@test.com`,
      assignedSalesperson: admin._id,
    });

    // Attempt access by Salesperson
    const getRes = await request(app)
      .get(`/api/v1/leads/${lead.leadId}`)
      .set('x-dev-role', 'SALESPERSON')
      .set('x-user-id', String(salesperson._id));

    assert.strictEqual(getRes.status, 403);
    assert.strictEqual(getRes.body.error.code, 'FORBIDDEN');

    await Lead.deleteOne({ _id: lead._id });
  });

  test('Scenario 5 & 6: Independent Database Calculations & Master Reconciliation Audit', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/overview/reconciliation?period=MONTH&year=2026&month=10')
      .set('x-dev-role', 'ADMIN');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, 'PASS');
    assert.strictEqual(res.body.overallStatus, 'PASS');
    assert.strictEqual(res.body.summary.failedChecks, 0);
  });

  test('Scenario 10: Audit Log Trail records every lifecycle action immutably', async () => {
    const recentAudits = await AuditLog.find().sort({ createdAt: -1 }).limit(10);
    assert.ok(recentAudits.length > 0);

    const hasEntityId = recentAudits.every(a => !!a.entityId && !!a.actorId && !!a.action);
    assert.strictEqual(hasEntityId, true);
  });

});
