const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');
const Salesperson = require('../src/models/Salesperson');
const Lead = require('../src/models/Lead');
const AuditLog = require('../src/models/AuditLog');
const Deal = require('../src/models/Deal');
const Customer = require('../src/models/Customer');
const Revenue = require('../src/models/Revenue');

let salespersonA;
let salespersonB;
let adminUser;

before(async () => {
  await connectDB();

  // Clean up any residual test records from prior runs
  await Lead.deleteMany({
    companyName: {
      $in: [
        'Apex Robotics Pvt Ltd',
        'Lost Path Dynamics',
        'Jump Test Corp',
        'Negative Value Test',
        'Bad Email Co',
        'Duplicate Alpha Corp',
      ],
    },
  });
  await Deal.deleteMany({ opportunityName: /Apex Robotics/i });
  await Customer.deleteMany({ companyName: 'Apex Robotics Pvt Ltd' });

  // Fetch test salespersons
  salespersonA = await Salesperson.findOne({ email: 'rahul@harvik.com' });
  salespersonB = await Salesperson.findOne({ email: 'sneha@harvik.com' });
  adminUser = await Salesperson.findOne({ systemRole: 'ADMIN' });
});

after(async () => {
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
  const apexDeals = await Deal.find({ opportunityName: /Apex Robotics/i }).select('_id');
  const dealIds = apexDeals.map(d => d._id);
  await Revenue.deleteMany({ deal: { $in: dealIds } });
  await Deal.deleteMany({ _id: { $in: dealIds } });
  await Customer.deleteMany({ companyName: 'Apex Robotics Pvt Ltd' });
  await mongoose.disconnect();
});

describe('Lead Management Control Layer Integration & Negative Tests (Sections 34 & 35)', () => {

  let testLeadId;
  let testLeadMongoId;

  describe('1. Lead Creation & Unique ID Generation (Section 3 & 4)', () => {
    test('POST /api/v1/leads creates a lead with auto-generated unique leadId and audit trail', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Apex Robotics Pvt Ltd',
          contactPerson: 'Anand Kumar',
          email: 'anand@apexrobotics.io',
          phone: '+91 9888877771',
          source: 'WEBSITE',
          industry: 'Technology',
          expectedValue: 1500000,
          assignedSalesperson: salespersonA._id,
          location: { city: 'Pune', country: 'India' },
          notes: 'Autonomous warehouse robotics requirement',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.leadId);
      assert.match(res.body.data.leadId, /^LEAD-\d{6}$/);
      assert.strictEqual(res.body.data.status, 'NEW');
      assert.strictEqual(res.body.data.expectedValue, 1500000);
      assert.ok(res.body.data.leadQualityScore > 0);

      testLeadId = res.body.data.leadId;
      testLeadMongoId = res.body.data._id;

      // Verify audit log
      const audit = await AuditLog.findOne({ entityId: testLeadId, action: 'LEAD_CREATED' });
      assert.ok(audit, 'AuditLog entry must be recorded for LEAD_CREATED');
    });
  });

  describe('2. Lead Listing, Pagination, Filters & Search (Section 16 & 17)', () => {
    test('GET /api/v1/leads returns paginated list with total count and metadata', async () => {
      const res = await request(app)
        .get('/api/v1/leads?page=1&limit=5')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.leads));
      assert.strictEqual(res.body.data.leads.length, 5);
      assert.ok(res.body.data.pagination.total >= 8);
    });

    test('GET /api/v1/leads filters by status=QUALIFIED', async () => {
      const res = await request(app)
        .get('/api/v1/leads?status=QUALIFIED')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.leads.length >= 1);
      res.body.data.leads.forEach(l => assert.strictEqual(l.status, 'QUALIFIED'));
    });

    test('GET /api/v1/leads searches by company name', async () => {
      const res = await request(app)
        .get('/api/v1/leads?search=TechNova')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.leads.some(l => l.companyName.includes('TechNova')));
    });

    test('GET /api/v1/leads/:id fetches single lead by business leadId', async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${testLeadId}`)
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.leadId, testLeadId);
      assert.strictEqual(res.body.data.companyName, 'Apex Robotics Pvt Ltd');
    });
  });

  describe('3. Complete Lifecycle State Machine Progression (Section 6-12 & 39)', () => {
    test('NEW -> CONTACTED succeeds and records lastContactAt', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'CONTACTED',
          reason: 'Initial discovery call conducted',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'CONTACTED');
      assert.ok(res.body.data.lastContactAt);
    });

    test('CONTACTED -> QUALIFIED succeeds and sets qualifiedAt timestamp', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'QUALIFIED',
          reason: 'Customer requirement and budget verified',
          data: {
            requirement: 'Fleet management software for 50 autonomous robots',
            expectedValue: 1800000,
            nextFollowUpAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'QUALIFIED');
      assert.ok(res.body.data.qualifiedAt);
    });

    test('QUALIFIED -> PROPOSAL succeeds and sets proposalAt timestamp', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'PROPOSAL',
          reason: 'Formal proposal submitted',
          data: {
            productService: 'Robotics Orchestration Platform v2',
            expectedClosingDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
            proposalValue: 1800000,
          },
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'PROPOSAL');
      assert.ok(res.body.data.proposalAt);
    });

    test('PROPOSAL -> NEGOTIATION succeeds and sets negotiationAt timestamp', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'NEGOTIATION',
          reason: 'Commercial terms and SLA being negotiated',
          data: {
            proposalValue: 1750000,
            decisionMaker: 'Anand Kumar (CTO)',
          },
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'NEGOTIATION');
      assert.ok(res.body.data.negotiationAt);
    });

    test('NEGOTIATION -> WON succeeds, sets wonAt, triggers deal/customer creation, audits LEAD_WON', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'WON',
          reason: 'Master service agreement signed',
          data: {
            finalDealValue: 1750000,
            productService: 'Robotics Orchestration Platform v2',
          },
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'WON');
      assert.ok(res.body.data.wonAt);

      // Verify idempotent downstream Deal creation (Requirement #12)
      const deal = await Deal.findOne({ lead: testLeadMongoId });
      assert.ok(deal, 'Deal record must be automatically created upon WON');
      assert.strictEqual(deal.stage, 'Won');
      assert.strictEqual(deal.dealValue, 1750000);

      // Verify audit trail
      const audit = await AuditLog.findOne({ entityId: testLeadId, action: 'LEAD_WON' });
      assert.ok(audit, 'AuditLog entry must be recorded for LEAD_WON');
    });

    test('NEGOTIATION -> LOST transition path with reason (Section 13)', async () => {
      // Create a temporary lead to test LOST path
      const createRes = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Lost Path Dynamics',
          contactPerson: 'Suresh Raina',
          email: 'suresh@lostdynamics.com',
          phone: '+91 9777766661',
          source: 'WEBSITE',
          status: 'NEW',
          assignedSalesperson: salespersonA._id,
        });

      const lostLeadId = createRes.body.data.leadId;

      // Move NEW -> CONTACTED
      await request(app)
        .patch(`/api/v1/leads/${lostLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({ status: 'CONTACTED' });

      // Move CONTACTED -> QUALIFIED
      await request(app)
        .patch(`/api/v1/leads/${lostLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'QUALIFIED',
          data: {
            requirement: 'Cloud ERP solution',
            expectedValue: 600000,
            nextFollowUpAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
        });

      // Move QUALIFIED -> PROPOSAL
      await request(app)
        .patch(`/api/v1/leads/${lostLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'PROPOSAL',
          data: {
            productService: 'Cloud ERP',
            expectedClosingDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
            proposalValue: 600000,
          },
        });

      // Move PROPOSAL -> NEGOTIATION
      await request(app)
        .patch(`/api/v1/leads/${lostLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'NEGOTIATION',
          data: {
            proposalValue: 600000,
            decisionMaker: 'Suresh Raina',
          },
        });

      // Move NEGOTIATION -> LOST with lossReason
      const lostRes = await request(app)
        .patch(`/api/v1/leads/${lostLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'LOST',
          lossReason: 'COMPETITOR',
          reason: 'Customer chose competitor offering lower price',
        });

      assert.strictEqual(lostRes.status, 200);
      assert.strictEqual(lostRes.body.data.status, 'LOST');
      assert.strictEqual(lostRes.body.data.lossReason, 'COMPETITOR');
      assert.ok(lostRes.body.data.lostAt);
    });
  });

  describe('4. Salesperson Assignment & Data Isolation (Sections 18 & 19)', () => {
    test('PATCH /api/v1/leads/:id/assignment allows ADMIN to reassign lead and creates LEAD_REASSIGNED audit', async () => {
      // Reassign to Salesperson B
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/assignment`)
        .set('x-dev-role', 'ADMIN')
        .send({
          salespersonId: salespersonB._id,
          reason: 'Workload balancing',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(String(res.body.data.assignedSalesperson._id || res.body.data.assignedSalesperson), String(salespersonB._id));

      const audit = await AuditLog.findOne({ entityId: testLeadId, action: 'LEAD_REASSIGNED' });
      assert.ok(audit, 'AuditLog entry must be recorded for LEAD_REASSIGNED');
    });

    test('Salesperson assignment is rejected (403 FORBIDDEN) if initiated by SALESPERSON role', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/assignment`)
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonA._id))
        .send({
          salespersonId: salespersonA._id,
        });

      assert.strictEqual(res.status, 403);
    });

    test('Salesperson data isolation restricts SALESPERSON query to their assigned leads only (Req #19)', async () => {
      const res = await request(app)
        .get('/api/v1/leads')
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonA._id));

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.leads.length > 0);
      res.body.data.leads.forEach((l) => {
        const assignedId = String(l.assignedSalesperson?._id || l.assignedSalesperson);
        assert.strictEqual(assignedId, String(salespersonA._id));
      });
    });

    test('Salesperson data isolation blocks access (403 FORBIDDEN) to another salesperson lead', async () => {
      // testLeadId was reassigned to salesperson B, so salesperson A should be forbidden
      const res = await request(app)
        .get(`/api/v1/leads/${testLeadId}`)
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(salespersonA._id));

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });

  describe('5. Mandatory Negative Tests (Section 35)', () => {
    test('NEW -> WON transition is rejected (400 INVALID_STATUS_TRANSITION)', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Jump Test Corp',
          contactPerson: 'Ravi Verma',
          email: 'ravi@jumptest.com',
          phone: '+91 9555544441',
        });

      const lead = res.body.data;

      const jumpRes = await request(app)
        .patch(`/api/v1/leads/${lead.leadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({ status: 'WON' });

      assert.strictEqual(jumpRes.status, 400);
      assert.strictEqual(jumpRes.body.error.code, 'INVALID_STATUS_TRANSITION');
    });

    test('NEW -> NEGOTIATION transition is rejected (400 INVALID_STATUS_TRANSITION)', async () => {
      const jumpRes = await request(app)
        .patch('/api/v1/leads/LEAD-000002/status')
        .set('x-dev-role', 'ADMIN')
        .send({ status: 'NEGOTIATION' });

      assert.strictEqual(jumpRes.status, 400);
      assert.strictEqual(jumpRes.body.error.code, 'INVALID_STATUS_TRANSITION');
    });

    test('Transition to LOST without loss reason is rejected (400 VALIDATION_ERROR)', async () => {
      const lostRes = await request(app)
        .patch('/api/v1/leads/LEAD-000001/status')
        .set('x-dev-role', 'ADMIN')
        .send({ status: 'LOST' });

      assert.strictEqual(lostRes.status, 400);
      assert.strictEqual(lostRes.body.error.code, 'VALIDATION_ERROR');
    });

    test('NEGOTIATION -> WON without required commercial information is rejected', async () => {
      const wonRes = await request(app)
        .patch('/api/v1/leads/LEAD-000001/status')
        .set('x-dev-role', 'ADMIN')
        .send({
          status: 'WON',
          data: { finalDealValue: -100 },
        });

      assert.strictEqual(wonRes.status, 400);
      assert.strictEqual(wonRes.body.error.code, 'VALIDATION_ERROR');
    });

    test('Negative expected value is rejected (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Negative Value Test',
          contactPerson: 'Bob',
          expectedValue: -50000,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('Malformed email is rejected (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Bad Email Co',
          contactPerson: 'Alice',
          email: 'not-an-email-at-all',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('Duplicate lead creation is rejected (409 POSSIBLE_DUPLICATE_LEAD)', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'ABC Solutions',
          contactPerson: 'Deepak Varma',
          email: 'contact@abcsolutions.com',
          phone: '+91 9000000002',
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'POSSIBLE_DUPLICATE_LEAD');
      assert.ok(res.body.data.existingLeadId);
    });

    test('Duplicate lead creation SUCCEEDS when allowDuplicate override flag is provided', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'ABC Solutions',
          contactPerson: 'Deepak Varma',
          email: 'contact@abcsolutions.com',
          allowDuplicate: true,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
    });

    test('Stale concurrent update returns 409 LEAD_VERSION_CONFLICT (Section 26)', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}`)
        .set('x-dev-role', 'ADMIN')
        .send({
          notes: 'Stale update attempt',
          version: 99999,
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'LEAD_VERSION_CONFLICT');
    });

    test('Already-WON lead cannot be transitioned again (400 LEAD_ALREADY_CLOSED)', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/status`)
        .set('x-dev-role', 'ADMIN')
        .send({ status: 'WON' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'LEAD_ALREADY_CLOSED');
    });

    test('Already-LOST lead cannot be transitioned to WON (400 LEAD_ALREADY_CLOSED)', async () => {
      const res = await request(app)
        .patch('/api/v1/leads/LEAD-000004/status')
        .set('x-dev-role', 'ADMIN')
        .send({ status: 'WON' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'LEAD_ALREADY_CLOSED');
    });

    test('Archived lead modification is rejected (404 LEAD_NOT_FOUND)', async () => {
      const createRes = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'Archive Test Corp',
          contactPerson: 'Kunal Shah',
          email: 'kunal@archivedtest.com',
        });
      const archiveLeadId = createRes.body.data.leadId;

      // Archive lead
      const archiveRes = await request(app)
        .patch(`/api/v1/leads/${archiveLeadId}/archive`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(archiveRes.status, 200);

      // Try to update archived lead
      const updateRes = await request(app)
        .patch(`/api/v1/leads/${archiveLeadId}`)
        .set('x-dev-role', 'ADMIN')
        .send({ notes: 'Trying to update archived' });

      assert.strictEqual(updateRes.status, 404);
    });
  });

  describe('6. Lead Analytics & Dashboard Connection (Section 28 & 29)', () => {
    test('GET /api/v1/leads/stats returns comprehensive pipeline counts and conversion metrics', async () => {
      const res = await request(app)
        .get('/api/v1/leads/stats')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.totalLeads > 0);
      assert.ok(typeof res.body.data.wonLeads === 'number');
      assert.ok(typeof res.body.data.lostLeads === 'number');
      assert.ok(typeof res.body.data.conversionRate === 'number');
      assert.ok(res.body.data.pipelineFunnel);
    });
  });

});
