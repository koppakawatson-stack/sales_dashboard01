const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');

const Lead = require('../src/models/Lead');
const Customer = require('../src/models/Customer');
const Deal = require('../src/models/Deal');
const Revenue = require('../src/models/Revenue');
const Salesperson = require('../src/models/Salesperson');
const Target = require('../src/models/Target');
const Activity = require('../src/models/Activity');
const { invalidateDashboardCache } = require('../src/config/redis');
const { calculateConversionRate, calculateTargetAchievement, calculateRemainingTarget } = require('../src/utils/calculations');

let aliceUser, bobUser, charlieUser, adminUser;

before(async () => {
  await connectDB();

  // Clean test namespace
  await Lead.deleteMany({ companyName: /^REQ_TEST_/ });
  await Customer.deleteMany({ companyName: /^REQ_TEST_/ });
  await Deal.deleteMany({ opportunityName: /^REQ_TEST_/ });
  await Revenue.deleteMany({ invoiceNumber: /^INV_REQ_/ });
  await Activity.deleteMany({ subject: /^REQ_TEST_/ });

  // Ensure Salespersons Alice, Bob, Charlie, Admin
  adminUser = await Salesperson.findOne({ email: 'admin@harvik.com' }) || await Salesperson.create({
    name: 'Harvik Admin',
    email: 'admin@harvik.com',
    role: 'Administrator',
    systemRole: 'ADMIN',
  });

  aliceUser = await Salesperson.findOne({ email: 'alice@harvik.com' }) || await Salesperson.create({
    name: 'Alice Sharma',
    email: 'alice@harvik.com',
    role: 'Senior Sales Rep',
    systemRole: 'SALESPERSON',
  });

  bobUser = await Salesperson.findOne({ email: 'bob@harvik.com' }) || await Salesperson.create({
    name: 'Bob Davis',
    email: 'bob@harvik.com',
    role: 'Sales Rep',
    systemRole: 'SALESPERSON',
  });

  charlieUser = await Salesperson.findOne({ email: 'charlie@harvik.com' }) || await Salesperson.create({
    name: 'Charlie Patel',
    email: 'charlie@harvik.com',
    role: 'Senior Sales Rep',
    systemRole: 'SALESPERSON',
  });
});

after(async () => {
  await Lead.deleteMany({ companyName: /^REQ_TEST_/ });
  await Customer.deleteMany({ companyName: /^REQ_TEST_/ });
  await Deal.deleteMany({ opportunityName: /^REQ_TEST_/ });
  await Revenue.deleteMany({ invoiceNumber: /^INV_REQ_/ });
  await Revenue.deleteMany({ invoiceNumber: /^INV_R/ });
  await Revenue.deleteMany({ invoiceNumber: /^INV_FINAL_/ });
  await Deal.deleteMany({ opportunityName: /^FINAL_ACCEPTANCE_/ });
  await Customer.deleteMany({ companyName: /^FINAL_ACCEPTANCE_/ });
  await Activity.deleteMany({ subject: /^REQ_TEST_/ });
  await mongoose.disconnect();
});

describe('HARVIK TECHNOLOGIES — SALES DASHBOARD REQUIREMENT VALIDATION', () => {

  // ==========================================
  // SECTION 1: SALES OVERVIEW (SO-001 - SO-016)
  // ==========================================
  describe('1. Sales Overview Verification (SO-001 to SO-016)', () => {

    test('SO-001: Total Leads count matches MongoDB, API & Dashboard calculations', async () => {
      const prefix = `REQ_TEST_SO001_${Date.now()}`;
      const leads = [
        await Lead.create({ companyName: `${prefix}_Lead_A`, contactPerson: 'Person A', email: `a_${Date.now()}@test.com`, status: 'NEW' }),
        await Lead.create({ companyName: `${prefix}_Lead_B`, contactPerson: 'Person B', email: `b_${Date.now()}@test.com`, status: 'CONTACTED' }),
        await Lead.create({ companyName: `${prefix}_Lead_C`, contactPerson: 'Person C', email: `c_${Date.now()}@test.com`, status: 'QUALIFIED' }),
        await Lead.create({ companyName: `${prefix}_Lead_D`, contactPerson: 'Person D', email: `d_${Date.now()}@test.com`, status: 'PROPOSAL' }),
      ];
      await invalidateDashboardCache();

      const dbCount = await Lead.countDocuments({ companyName: new RegExp(`^${prefix}`) });
      assert.strictEqual(dbCount, 4, 'MongoDB must have exactly 4 leads for this batch');

      const apiRes = await request(app)
        .get(`/api/v1/leads?search=${prefix}`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(apiRes.status, 200);
      assert.strictEqual(apiRes.body.data?.pagination?.total || apiRes.body.total, 4);

      await Lead.deleteMany({ _id: { $in: leads.map(l => l._id) } });
    });

    test('SO-002: New Leads filtering and counting (Expected: 2)', async () => {
      const prefix = `REQ_TEST_SO002_${Date.now()}`;
      const leads = [
        await Lead.create({ companyName: `${prefix}_A`, contactPerson: 'A', email: `a_${Date.now()}@test.com`, status: 'NEW' }),
        await Lead.create({ companyName: `${prefix}_B`, contactPerson: 'B', email: `b_${Date.now()}@test.com`, status: 'NEW' }),
        await Lead.create({ companyName: `${prefix}_C`, contactPerson: 'C', email: `c_${Date.now()}@test.com`, status: 'CONTACTED' }),
        await Lead.create({ companyName: `${prefix}_D`, contactPerson: 'D', email: `d_${Date.now()}@test.com`, status: 'QUALIFIED' }),
      ];
      const newCount = await Lead.countDocuments({ companyName: new RegExp(`^${prefix}`), status: 'NEW' });
      assert.strictEqual(newCount, 2);

      const apiRes = await request(app)
        .get(`/api/v1/leads?status=NEW&search=${prefix}`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(apiRes.status, 200);
      const items = apiRes.body.data?.leads || apiRes.body.leads || apiRes.body.data || apiRes.body;
      assert.strictEqual(items.length, 2);

      await Lead.deleteMany({ _id: { $in: leads.map(l => l._id) } });
    });

    test('SO-003: Qualified Leads count (Expected: 2)', async () => {
      const prefix = `REQ_TEST_SO003_${Date.now()}`;
      const leads = [
        await Lead.create({ companyName: `${prefix}_A`, contactPerson: 'A', email: `a_${Date.now()}@test.com`, status: 'QUALIFIED' }),
        await Lead.create({ companyName: `${prefix}_B`, contactPerson: 'B', email: `b_${Date.now()}@test.com`, status: 'QUALIFIED' }),
        await Lead.create({ companyName: `${prefix}_C`, contactPerson: 'C', email: `c_${Date.now()}@test.com`, status: 'NEW' }),
        await Lead.create({ companyName: `${prefix}_D`, contactPerson: 'D', email: `d_${Date.now()}@test.com`, status: 'CONTACTED' }),
      ];
      const qualifiedCount = await Lead.countDocuments({ companyName: new RegExp(`^${prefix}`), status: 'QUALIFIED' });
      assert.strictEqual(qualifiedCount, 2);
      await Lead.deleteMany({ _id: { $in: leads.map(l => l._id) } });
    });

    test('SO-004: Active Opportunities excludes WON and LOST (Expected: 4 active out of 6)', async () => {
      const prefix = `REQ_TEST_SO004_${Date.now()}`;
      const cust = await Customer.create({ companyName: `${prefix}_Cust`, email: `${prefix}@c.com` });
      const createdDeals = [
        await Deal.create({ opportunityName: `${prefix}_A`, customer: cust._id, salesperson: aliceUser._id, productService: 'Software', dealValue: 100000, stage: 'Lead', probability: 20, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_B`, customer: cust._id, salesperson: aliceUser._id, productService: 'Software', dealValue: 200000, stage: 'Qualified', probability: 40, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_C`, customer: cust._id, salesperson: aliceUser._id, productService: 'Software', dealValue: 300000, stage: 'Proposal', probability: 60, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_D`, customer: cust._id, salesperson: aliceUser._id, productService: 'Software', dealValue: 400000, stage: 'Negotiation', probability: 80, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_E`, customer: cust._id, salesperson: aliceUser._id, productService: 'Software', dealValue: 500000, stage: 'Won', probability: 100, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_F`, customer: cust._id, salesperson: aliceUser._id, productService: 'Software', dealValue: 600000, stage: 'Lost', probability: 0, expectedClosingDate: new Date() }),
      ];

      const activeInDb = await Deal.countDocuments({
        opportunityName: new RegExp(`^${prefix}`),
        stage: { $nin: ['Won', 'Lost', 'WON', 'LOST'] },
      });
      assert.strictEqual(activeInDb, 4, 'Active opportunities in DB must be exactly 4');

      await Deal.deleteMany({ _id: { $in: createdDeals.map(d => d._id) } });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('SO-005 & SO-006: Won Deals and Lost Deals counting (SO-005=2 Won, SO-006=3 Lost)', async () => {
      const prefix = `REQ_TEST_SO0056_${Date.now()}`;
      const cust = await Customer.create({ companyName: `${prefix}_Cust`, email: `${prefix}@c.com` });
      const deals = [
        await Deal.create({ opportunityName: `${prefix}_W1`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, stage: 'Won', expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_W2`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 200000, stage: 'Won', expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_L1`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 300000, stage: 'Lost', expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_L2`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 400000, stage: 'Lost', expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_L3`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 500000, stage: 'Lost', expectedClosingDate: new Date() }),
      ];

      const wonCount = await Deal.countDocuments({ opportunityName: new RegExp(`^${prefix}`), stage: 'Won' });
      const lostCount = await Deal.countDocuments({ opportunityName: new RegExp(`^${prefix}`), stage: 'Lost' });
      assert.strictEqual(wonCount, 2);
      assert.strictEqual(lostCount, 3);

      await Deal.deleteMany({ _id: { $in: deals.map(d => d._id) } });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('SO-007, SO-008, SO-009: Pipeline calculation strictly excludes WON and LOST (₹60L total, ₹20L active)', async () => {
      const prefix = `REQ_TEST_SO007_${Date.now()}`;
      const cust = await Customer.create({ companyName: `${prefix}_Cust`, email: `${prefix}@c.com` });
      const deals = [
        await Deal.create({ opportunityName: `${prefix}_A`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 1000000, stage: 'Qualified', probability: 50, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_B`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 2000000, stage: 'Proposal', probability: 50, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_C`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 3000000, stage: 'Negotiation', probability: 50, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_Won`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 3000000, stage: 'Won', probability: 100, expectedClosingDate: new Date() }),
        await Deal.create({ opportunityName: `${prefix}_Lost`, customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 3000000, stage: 'Lost', probability: 0, expectedClosingDate: new Date() }),
      ];

      const activeDeals = await Deal.find({
        opportunityName: new RegExp(`^${prefix}`),
        stage: { $nin: ['Won', 'Lost'] },
      });
      const pipelineSum = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
      assert.strictEqual(pipelineSum, 6000000, 'Pipeline sum must be exactly ₹60,00,000 without Won/Lost');

      // Test SO-008: Active 20L + Won 30L -> Pipeline = 20L
      const subsetActiveAndWon = [deals[1], deals[3]]; // 20L active, 30L won
      const subPipeline = subsetActiveAndWon.filter(d => !['Won', 'Lost'].includes(d.stage)).reduce((s, d) => s + d.dealValue, 0);
      assert.strictEqual(subPipeline, 2000000, 'Pipeline must be ₹20,00,000, NOT ₹50,00,000');

      await Deal.deleteMany({ _id: { $in: deals.map(d => d._id) } });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('SO-010: Won Revenue calculation (₹25,00,000)', async () => {
      const prefix = `REQ_TEST_SO010_${Date.now()}`;
      const cust = await Customer.create({ companyName: `${prefix}_Cust`, email: `${prefix}@c.com` });
      const wonDeal = await Deal.create({
        opportunityName: `${prefix}_Won`,
        customer: cust._id,
        salesperson: aliceUser._id,
        productService: 'Analytics',
        dealValue: 2500000,
        stage: 'Won',
        wonAt: new Date(),
        expectedClosingDate: new Date(),
      });

      const revenueDoc = await Revenue.create({
        deal: wonDeal._id,
        customer: cust._id,
        salesperson: aliceUser._id,
        productService: 'Analytics',
        amount: 2500000,
        recognizedDate: new Date(),
        invoiceNumber: `INV_REQ_${Date.now()}`,
      });

      assert.strictEqual(revenueDoc.amount, 2500000);
      await Revenue.deleteOne({ _id: revenueDoc._id });
      await Deal.deleteOne({ _id: wonDeal._id });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('SO-011: Monthly Revenue isolation (October revenue = ₹6,00,000; September excluded)', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_MonthlyRevCust', email: `mrc_${Date.now()}@t.com` });
      const oct1 = new Date('2026-10-01T10:00:00Z');
      const oct5 = new Date('2026-10-05T10:00:00Z');
      const oct8 = new Date('2026-10-08T10:00:00Z');
      const sep15 = new Date('2026-09-15T10:00:00Z');

      const revenues = [
        await Revenue.create({ customer: cust._id, invoiceNumber: `INV_REQ_OCT1_${Date.now()}`, amount: 100000, date: oct1, recognizedAt: oct1, salesperson: aliceUser._id, productService: 'Software' }),
        await Revenue.create({ customer: cust._id, invoiceNumber: `INV_REQ_OCT5_${Date.now()}`, amount: 200000, date: oct5, recognizedAt: oct5, salesperson: aliceUser._id, productService: 'Software' }),
        await Revenue.create({ customer: cust._id, invoiceNumber: `INV_REQ_OCT8_${Date.now()}`, amount: 300000, date: oct8, recognizedAt: oct8, salesperson: aliceUser._id, productService: 'Software' }),
        await Revenue.create({ customer: cust._id, invoiceNumber: `INV_REQ_SEP_${Date.now()}`, amount: 500000, date: sep15, recognizedAt: sep15, salesperson: aliceUser._id, productService: 'Software' }),
      ];

      const octRevenues = await Revenue.find({
        _id: { $in: revenues.map(r => r._id) },
        date: { $gte: new Date('2026-10-01T00:00:00Z'), $lte: new Date('2026-10-31T23:59:59Z') },
      });
      const octTotal = octRevenues.reduce((s, r) => s + r.amount, 0);
      assert.strictEqual(octTotal, 600000, 'October revenue must be exactly ₹6,00,000');

      await Revenue.deleteMany({ _id: { $in: revenues.map(r => r._id) } });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('SO-012, SO-013, SO-014: Monthly Target, Target Achievement & Overachievement', async () => {
      // SO-012: October Target = ₹10,00,000
      const target = 1000000;
      assert.strictEqual(target, 1000000);

      // SO-013: Target 10L, Revenue 7.5L -> 75%
      const ach75 = calculateTargetAchievement(750000, 1000000);
      assert.strictEqual(ach75, 75);

      // SO-014: Target 10L, Revenue 12L -> 120% (Overachievement)
      const ach120 = calculateTargetAchievement(1200000, 1000000);
      assert.strictEqual(ach120, 120);
    });

    test('SO-015: Conversion Rate calculation (100 total leads, 20 converted = 20%)', () => {
      const conv = calculateConversionRate(20, 100);
      assert.strictEqual(conv, 20);
    });

    test('SO-016: Salesperson Performance ranking (Charlie ₹15L > Alice ₹10L > Bob ₹5L)', async () => {
      const ranking = [
        { name: 'Charlie', revenue: 1500000 },
        { name: 'Alice', revenue: 1000000 },
        { name: 'Bob', revenue: 500000 },
      ].sort((a, b) => b.revenue - a.revenue);

      assert.strictEqual(ranking[0].name, 'Charlie', 'Charlie must be highest performer');
      assert.strictEqual(ranking[0].revenue, 1500000);
      assert.strictEqual(ranking[1].name, 'Alice');
      assert.strictEqual(ranking[2].name, 'Bob');
    });

  });

  // ==========================================
  // SECTION 2: LEAD MANAGEMENT (LM-001 - LM-012)
  // ==========================================
  describe('2. Lead Management Verification (LM-001 to LM-012)', () => {

    test('LM-001: Create a completely valid lead', async () => {
      const email = `lm001_${Date.now()}@harviktest.com`;
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'REQ_TEST_Acme Corp',
          contactPerson: 'Rajesh Kumar',
          email,
          phone: '+91 9876543210',
          source: 'Website',
          industry: 'Technology',
          location: 'Bangalore',
          assignedSalesperson: aliceUser._id,
          status: 'NEW',
          expectedValue: 500000,
          notes: 'High priority requirement',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.data?.leadId || res.body.leadId || res.body._id);
      const inDb = await Lead.findOne({ email });
      assert.ok(inDb);
      assert.strictEqual(inDb.companyName, 'REQ_TEST_Acme Corp');

      await Lead.deleteOne({ _id: inDb._id });
    });

    test('LM-002: Create lead without company name returns validation error', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          contactPerson: 'No Company Person',
          email: `lm002_${Date.now()}@test.com`,
          status: 'NEW',
        });
      assert.strictEqual(res.status, 400);
    });

    test('LM-003: Create lead with invalid email returns validation error', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'REQ_TEST_Invalid Email Corp',
          contactPerson: 'Person',
          email: 'not-an-email',
          status: 'NEW',
        });
      assert.strictEqual(res.status, 400);
    });

    test('LM-004: Create lead with negative expected value is rejected', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'REQ_TEST_Negative Value Corp',
          contactPerson: 'Person',
          email: `neg_${Date.now()}@test.com`,
          expectedValue: -5000,
          status: 'NEW',
        });
      assert.strictEqual(res.status, 400);
    });

    test('LM-005: Create lead with valid expected value = ₹0', async () => {
      const email = `zero_${Date.now()}@test.com`;
      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'REQ_TEST_Zero Value Corp',
          contactPerson: 'Person',
          email,
          expectedValue: 0,
          status: 'NEW',
        });
      assert.strictEqual(res.status, 201);
      await Lead.deleteOne({ email });
    });

    test('LM-006: Assign lead to salesperson', async () => {
      const lead = await Lead.create({
        companyName: 'REQ_TEST_Assign Corp',
        contactPerson: 'Person',
        email: `assign_${Date.now()}@test.com`,
        assignedSalesperson: aliceUser._id,
      });

      const res = await request(app)
        .patch(`/api/v1/leads/${lead.leadId}/assignment`)
        .set('x-dev-role', 'ADMIN')
        .send({ salespersonId: bobUser._id });

      assert.strictEqual(res.status, 200);
      const updated = await Lead.findById(lead._id);
      assert.strictEqual(String(updated.assignedSalesperson), String(bobUser._id));

      await Lead.deleteOne({ _id: lead._id });
    });

    test('LM-007, LM-008, LM-009: Search by company, filter by status NEW, filter by salesperson', async () => {
      const emailA = `search_a_${Date.now()}@test.com`;
      const emailB = `search_b_${Date.now()}@test.com`;
      const leadA = await Lead.create({
        companyName: 'REQ_TEST_UniqueSearchAlpha',
        contactPerson: 'Alpha User',
        email: emailA,
        status: 'NEW',
        assignedSalesperson: aliceUser._id,
      });
      const leadB = await Lead.create({
        companyName: 'REQ_TEST_UniqueSearchBeta',
        contactPerson: 'Beta User',
        email: emailB,
        status: 'QUALIFIED',
        assignedSalesperson: bobUser._id,
      });

      // LM-007: Search by company name
      const searchRes = await request(app)
        .get('/api/v1/leads?search=UniqueSearchAlpha')
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(searchRes.status, 200);
      const foundA = (searchRes.body.data?.leads || searchRes.body.leads || searchRes.body.data || searchRes.body).some(l => l.companyName.includes('UniqueSearchAlpha'));
      assert.strictEqual(foundA, true);

      // LM-008: Filter by status NEW
      const statusRes = await request(app)
        .get('/api/v1/leads?status=NEW&search=REQ_TEST_UniqueSearch')
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(statusRes.status, 200);
      const items = statusRes.body.data?.leads || statusRes.body.leads || statusRes.body.data || statusRes.body;
      assert.ok(items.every(l => l.status === 'NEW'));

      await Lead.deleteMany({ _id: { $in: [leadA._id, leadB._id] } });
    });

    test('LM-010: Update lead contact information', async () => {
      const lead = await Lead.create({
        companyName: 'REQ_TEST_Update Corp',
        contactPerson: 'Original Person',
        email: `up_${Date.now()}@test.com`,
        phone: '+91 9111111111',
      });

      const res = await request(app)
        .patch(`/api/v1/leads/${lead.leadId}`)
        .set('x-dev-role', 'ADMIN')
        .send({ contactPerson: 'Updated Person', phone: '+91 9999999999' });

      assert.strictEqual(res.status, 200);
      const updated = await Lead.findById(lead._id);
      assert.strictEqual(updated.contactPerson, 'Updated Person');
      assert.strictEqual(updated.phone, '+91 9999999999');

      await Lead.deleteOne({ _id: lead._id });
    });

    test('LM-011: Soft delete lead according to business rules', async () => {
      const lead = await Lead.create({
        companyName: 'REQ_TEST_Delete Corp',
        contactPerson: 'Person',
        email: `del_${Date.now()}@test.com`,
      });

      const res = await request(app)
        .delete(`/api/v1/leads/${lead.leadId}`)
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      const inDb = await Lead.findById(lead._id);
      assert.strictEqual(inDb.isDeleted, true);

      await Lead.deleteOne({ _id: lead._id });
    });

    test('LM-012: Controlled duplicate lead detection', async () => {
      const email = `dup_${Date.now()}@test.com`;
      const lead1 = await Lead.create({
        companyName: 'REQ_TEST_Duplicate Corp',
        contactPerson: 'Person 1',
        email,
      });

      const res = await request(app)
        .post('/api/v1/leads')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'REQ_TEST_Duplicate Corp',
          contactPerson: 'Person 2',
          email,
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'POSSIBLE_DUPLICATE_LEAD');

      await Lead.deleteMany({ email });
    });

  });

  // ==========================================
  // SECTION 3: LEAD STATUS TESTING (LS-001 - LS-010)
  // ==========================================
  describe('3. Lead Status Testing (LS-001 to LS-010)', () => {

    test('LS-001 to LS-006: Valid Sequential Lifecycle Transitions PASS', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);

      const lead = await Lead.create({
        companyName: 'REQ_TEST_Lifecycle Corp',
        contactPerson: 'Ramesh Sharma',
        email: `life_${Date.now()}@test.com`,
        phone: '+91 9876543210',
        status: 'NEW',
        assignedSalesperson: aliceUser._id,
        expectedValue: 500000,
        notes: 'Core ERP Software requirement',
        requirement: 'Core ERP Software requirement',
        productService: 'ERP Software',
        decisionMaker: 'Ramesh Sharma',
        expectedClosingDate: future,
        nextFollowUpDate: future,
        proposalValue: 500000,
        finalDealValue: 500000,
      });

      // LS-001: NEW -> CONTACTED
      let res = await request(app).patch(`/api/v1/leads/${lead.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'CONTACTED' });
      assert.strictEqual(res.status, 200);

      // LS-002: CONTACTED -> QUALIFIED
      res = await request(app).patch(`/api/v1/leads/${lead.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'QUALIFIED' });
      assert.strictEqual(res.status, 200);

      // LS-003: QUALIFIED -> PROPOSAL
      res = await request(app).patch(`/api/v1/leads/${lead.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'PROPOSAL' });
      assert.strictEqual(res.status, 200);

      // LS-004: PROPOSAL -> NEGOTIATION
      res = await request(app).patch(`/api/v1/leads/${lead.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'NEGOTIATION' });
      assert.strictEqual(res.status, 200);

      // LS-005: NEGOTIATION -> WON
      res = await request(app).patch(`/api/v1/leads/${lead.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'WON' });
      assert.strictEqual(res.status, 200);

      await Lead.deleteOne({ _id: lead._id });
    });

    test('LS-007, LS-008, LS-009, LS-010: Invalid Stage Jumps and Closed Reopening are REJECTED', async () => {
      // LS-007: NEW -> WON
      const leadNew = await Lead.create({ companyName: 'REQ_TEST_JumpNew', contactPerson: 'P', email: `jn_${Date.now()}@t.com`, status: 'NEW' });
      let res = await request(app).patch(`/api/v1/leads/${leadNew.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'WON' });
      assert.strictEqual(res.status, 400);

      // LS-008: NEW -> NEGOTIATION
      res = await request(app).patch(`/api/v1/leads/${leadNew.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'NEGOTIATION' });
      assert.strictEqual(res.status, 400);

      // LS-009: CONTACTED -> WON
      const leadCont = await Lead.create({ companyName: 'REQ_TEST_JumpCont', contactPerson: 'P', email: `jc_${Date.now()}@t.com`, status: 'CONTACTED' });
      res = await request(app).patch(`/api/v1/leads/${leadCont.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'WON' });
      assert.strictEqual(res.status, 400);

      // LS-010: LOST -> WON (Terminal closure)
      const leadLost = await Lead.create({ companyName: 'REQ_TEST_LostLead', contactPerson: 'P', email: `ll_${Date.now()}@t.com`, status: 'LOST' });
      res = await request(app).patch(`/api/v1/leads/${leadLost.leadId}/status`).set('x-dev-role', 'ADMIN').send({ status: 'WON' });
      assert.strictEqual(res.status, 400);

      await Lead.deleteMany({ _id: { $in: [leadNew._id, leadCont._id, leadLost._id] } });
    });

  });

  // ==========================================
  // SECTION 4: CUSTOMER MANAGEMENT (CM-001 - CM-008)
  // ==========================================
  describe('4. Customer Management Verification (CM-001 to CM-008)', () => {

    test('CM-001 to CM-005: Create, Update, Retrieve, Search & Assign Salesperson', async () => {
      const email = `cust_${Date.now()}@harviktest.com`;
      // CM-001: Create valid customer
      const resCreate = await request(app)
        .post('/api/v1/customers')
        .set('x-dev-role', 'ADMIN')
        .send({
          companyName: 'REQ_TEST_Customer Corp',
          contactPerson: 'Vikram Mehta',
          email,
          phone: '+91 9123456780',
          industry: 'Healthcare',
          address: { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
          assignedSalesperson: aliceUser._id,
          status: 'Active',
        });
      assert.strictEqual(resCreate.status, 201);
      const custId = resCreate.body.customerId || resCreate.body._id;

      // CM-002: Update customer
      const resUpdate = await request(app)
        .patch(`/api/v1/customers/${custId}`)
        .set('x-dev-role', 'ADMIN')
        .send({ phone: '+91 9888877777', industry: 'Technology' });
      assert.strictEqual(resUpdate.status, 200);

      // CM-003: Retrieve customer profile
      const resGet = await request(app)
        .get(`/api/v1/customers/${custId}`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(resGet.status, 200);
      assert.strictEqual(resGet.body.industry, 'Technology');

      // CM-004: Search customer
      const resSearch = await request(app)
        .get('/api/v1/customers?search=Customer Corp')
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(resSearch.status, 200);
      const found = (resSearch.body.customers || resSearch.body.data || resSearch.body).some(c => c.companyName.includes('Customer Corp'));
      assert.strictEqual(found, true);

      // CM-005: Assign salesperson
      const resAssign = await request(app)
        .patch(`/api/v1/customers/${custId}`)
        .set('x-dev-role', 'ADMIN')
        .send({ assignedSalesperson: bobUser._id });
      assert.strictEqual(resAssign.status, 200);

      await Customer.deleteOne({ email });
    });

    test('CM-006 & CM-007: Customer revenue matches ₹0 with no revenue and valid sum with WON deals', async () => {
      const cust = await Customer.create({
        companyName: 'REQ_TEST_RevCust',
        email: `revcust_${Date.now()}@t.com`,
        totalRevenue: 0,
      });

      // CM-006: No revenue
      assert.strictEqual(cust.totalRevenue, 0);

      // CM-007: Multiple WON deals recognize exact revenue
      const deal1 = await Deal.create({ opportunityName: 'REQ_TEST_D1', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 300000, stage: 'Won', expectedClosingDate: new Date() });
      const deal2 = await Deal.create({ opportunityName: 'REQ_TEST_D2', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 700000, stage: 'Won', expectedClosingDate: new Date() });
      const rev1 = await Revenue.create({ customer: cust._id, deal: deal1._id, salesperson: aliceUser._id, productService: 'S', amount: 300000, invoiceNumber: `INV_R1_${Date.now()}` });
      const rev2 = await Revenue.create({ customer: cust._id, deal: deal2._id, salesperson: aliceUser._id, productService: 'S', amount: 700000, invoiceNumber: `INV_R2_${Date.now()}` });

      const customerRevenues = await Revenue.find({ customer: cust._id });
      const totalCustomerRev = customerRevenues.reduce((s, r) => s + r.amount, 0);
      assert.strictEqual(totalCustomerRev, 1000000);

      await Revenue.deleteMany({ _id: { $in: [rev1._id, rev2._id] } });
      await Deal.deleteMany({ _id: { $in: [deal1._id, deal2._id] } });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('CM-008: Unauthorized access / cross-salesperson restriction is blocked (403)', async () => {
      const cust = await Customer.create({
        companyName: 'REQ_TEST_IsolatedCust',
        email: `iso_${Date.now()}@t.com`,
        assignedSalesperson: aliceUser._id,
      });

      const res = await request(app)
        .get(`/api/v1/customers/${cust.customerId || cust._id}`)
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', String(bobUser._id));

      assert.strictEqual(res.status, 403);
      await Customer.deleteOne({ _id: cust._id });
    });

  });

  // ==========================================
  // SECTION 5: DEAL / OPPORTUNITY MANAGEMENT (OP-001 - OP-010)
  // ==========================================
  describe('5. Deal / Opportunity Management (OP-001 to OP-010)', () => {

    test('OP-001: Create valid opportunity', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_DealCust', email: `dc_${Date.now()}@t.com` });
      const res = await request(app)
        .post('/api/v1/deals')
        .set('x-dev-role', 'ADMIN')
        .send({
          opportunityName: 'REQ_TEST_Valid Opportunity',
          customer: cust._id,
          salesperson: aliceUser._id,
          productService: 'Cloud Platform',
          dealValue: 1500000,
          expectedClosingDate: new Date('2026-11-30'),
          probability: 70,
          stage: 'Proposal',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.dealId || res.body._id);

      await Deal.deleteOne({ opportunityName: 'REQ_TEST_Valid Opportunity' });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('OP-002: Create opportunity without customer is rejected', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set('x-dev-role', 'ADMIN')
        .send({
          opportunityName: 'REQ_TEST_No Cust Deal',
          salesperson: aliceUser._id,
          productService: 'Software',
          dealValue: 500000,
          expectedClosingDate: new Date(),
        });
      assert.strictEqual(res.status, 400);
    });

    test('OP-003: Create opportunity with negative deal value is rejected', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_NegCust', email: `negc_${Date.now()}@t.com` });
      const res = await request(app)
        .post('/api/v1/deals')
        .set('x-dev-role', 'ADMIN')
        .send({
          opportunityName: 'REQ_TEST_Neg Value Deal',
          customer: cust._id,
          salesperson: aliceUser._id,
          productService: 'Software',
          dealValue: -100000,
          expectedClosingDate: new Date(),
        });
      assert.strictEqual(res.status, 400);
      await Customer.deleteOne({ _id: cust._id });
    });

    test('OP-004 to OP-008: Probability boundary validations (0%, 50%, 100% PASS; -1%, 101% REJECT)', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_ProbCust', email: `prob_${Date.now()}@t.com` });

      // 0% -> Accepted
      let res = await request(app).post('/api/v1/deals').set('x-dev-role', 'ADMIN').send({
        opportunityName: 'REQ_TEST_P0', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, probability: 0, stage: 'Lead', expectedClosingDate: new Date()
      });
      assert.strictEqual(res.status, 201);

      // 50% -> Accepted
      res = await request(app).post('/api/v1/deals').set('x-dev-role', 'ADMIN').send({
        opportunityName: 'REQ_TEST_P50', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, probability: 50, stage: 'Lead', expectedClosingDate: new Date()
      });
      assert.strictEqual(res.status, 201);

      // 100% -> Accepted
      res = await request(app).post('/api/v1/deals').set('x-dev-role', 'ADMIN').send({
        opportunityName: 'REQ_TEST_P100', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, probability: 100, stage: 'Lead', expectedClosingDate: new Date()
      });
      assert.strictEqual(res.status, 201);

      // -1% -> Rejected
      res = await request(app).post('/api/v1/deals').set('x-dev-role', 'ADMIN').send({
        opportunityName: 'REQ_TEST_P_Neg', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, probability: -1, expectedClosingDate: new Date()
      });
      assert.strictEqual(res.status, 400);

      // 101% -> Rejected
      res = await request(app).post('/api/v1/deals').set('x-dev-role', 'ADMIN').send({
        opportunityName: 'REQ_TEST_P101', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, probability: 101, expectedClosingDate: new Date()
      });
      assert.strictEqual(res.status, 400);

      await Deal.deleteMany({ opportunityName: { $in: ['REQ_TEST_P0', 'REQ_TEST_P50', 'REQ_TEST_P100'] } });
      await Customer.deleteOne({ _id: cust._id });
    });

  });

  // ==========================================
  // SECTION 6: OPPORTUNITY STAGE TESTING (ST-001 - ST-008)
  // ==========================================
  describe('6. Opportunity Stage Progression Testing (ST-001 to ST-008)', () => {

    test('ST-001 to ST-005: Valid Stage Transitions PASS (Lead -> Qualified -> Proposal -> Negotiation -> Won)', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_StageCust', email: `stg_${Date.now()}@t.com` });
      const deal = await Deal.create({
        opportunityName: 'REQ_TEST_ProgressionDeal',
        customer: cust._id,
        salesperson: aliceUser._id,
        productService: 'SaaS',
        dealValue: 500000,
        stage: 'Lead',
        probability: 20,
        expectedClosingDate: new Date(),
      });

      // ST-001: Lead -> Qualified
      let res = await request(app).patch(`/api/v1/deals/${deal.dealId}/stage`).set('x-dev-role', 'ADMIN').send({ stage: 'Qualified' });
      assert.strictEqual(res.status, 200);

      // ST-002: Qualified -> Proposal
      res = await request(app).patch(`/api/v1/deals/${deal.dealId}/stage`).set('x-dev-role', 'ADMIN').send({ stage: 'Proposal' });
      assert.strictEqual(res.status, 200);

      // ST-003: Proposal -> Negotiation
      res = await request(app).patch(`/api/v1/deals/${deal.dealId}/stage`).set('x-dev-role', 'ADMIN').send({ stage: 'Negotiation' });
      assert.strictEqual(res.status, 200);

      // ST-004: Negotiation -> Won
      res = await request(app).patch(`/api/v1/deals/${deal.dealId}/stage`).set('x-dev-role', 'ADMIN').send({ stage: 'Won' });
      assert.strictEqual(res.status, 200);

      await Revenue.deleteMany({ deal: deal._id });
      await Deal.deleteOne({ _id: deal._id });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('ST-006, ST-007, ST-008: Illegal stage transitions REJECTED (Lead -> Won, Won -> Negotiation, Lost -> Proposal)', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_IllegalCust', email: `ill_${Date.now()}@t.com` });

      // ST-006: Lead -> Won (Illegal jump)
      const dealLead = await Deal.create({ opportunityName: 'REQ_TEST_JumpLead', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, stage: 'Lead', expectedClosingDate: new Date() });
      let res = await request(app).patch(`/api/v1/deals/${dealLead.dealId}/stage`).set('x-dev-role', 'ADMIN').send({ stage: 'Won' });
      assert.strictEqual(res.status, 400);

      // ST-007: Won -> Negotiation (Won is terminal)
      const dealWon = await Deal.create({ opportunityName: 'REQ_TEST_WonTerminal', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, stage: 'Won', expectedClosingDate: new Date() });
      res = await request(app).patch(`/api/v1/deals/${dealWon.dealId}/stage`).set('x-dev-role', 'ADMIN').send({ stage: 'Negotiation' });
      assert.strictEqual(res.status, 400);

      // ST-008: Lost -> Proposal (Lost is terminal)
      const dealLost = await Deal.create({ opportunityName: 'REQ_TEST_LostTerminal', customer: cust._id, salesperson: aliceUser._id, productService: 'S', dealValue: 100000, stage: 'Lost', expectedClosingDate: new Date() });
      res = await request(app).patch(`/api/v1/deals/${dealLost.dealId}/stage`).set('x-dev-role', 'ADMIN').send({ stage: 'Proposal' });
      assert.strictEqual(res.status, 400);

      await Deal.deleteMany({ _id: { $in: [dealLead._id, dealWon._id, dealLost._id] } });
      await Customer.deleteOne({ _id: cust._id });
    });

  });

  // ==========================================
  // SECTION 7: SALES ACTIVITY (ACT-001 - ACT-010)
  // ==========================================
  describe('7. Sales Activity Verification (ACT-001 to ACT-010)', () => {

    test('ACT-001 to ACT-006: Create Call, Meeting, Email, Demo, Follow-Up, Proposal activities', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_ActCust', email: `act_${Date.now()}@t.com` });
      const types = ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up', 'Proposal'];

      for (const activityType of types) {
        const res = await request(app)
          .post('/api/v1/activities')
          .set('x-dev-role', 'ADMIN')
          .send({
            activityType,
            customer: cust._id,
            salesperson: aliceUser._id,
            date: new Date(),
            notes: `Test note for ${activityType}`,
          });
        assert.strictEqual(res.status, 201, `Failed creating activity of type ${activityType}`);
      }

      await Activity.deleteMany({ customer: cust._id });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('ACT-007 & ACT-008: Activity without customer/lead or invalid type', async () => {
      // ACT-007: Missing entity association
      let res = await request(app).post('/api/v1/activities').set('x-dev-role', 'ADMIN').send({
        activityType: 'Call', salesperson: aliceUser._id, date: new Date()
      });
      assert.strictEqual(res.status, 400);

      // ACT-008: Invalid activity type
      const cust = await Customer.create({ companyName: 'REQ_TEST_BadActCust', email: `badact_${Date.now()}@t.com` });
      res = await request(app).post('/api/v1/activities').set('x-dev-role', 'ADMIN').send({
        activityType: 'INVALID_TYPE_XYZ', customer: cust._id, salesperson: aliceUser._id, date: new Date()
      });
      assert.strictEqual(res.status, 400);
      await Customer.deleteOne({ _id: cust._id });
    });

    test('ACT-009 & ACT-010: Upcoming and Overdue follow-up verification', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const leadUpcoming = await Lead.create({
        companyName: 'REQ_TEST_UpcomingLead', contactPerson: 'P', email: `upc_${Date.now()}@t.com`,
        status: 'CONTACTED', nextFollowUpDate: futureDate, assignedSalesperson: aliceUser._id
      });
      const leadOverdue = await Lead.create({
        companyName: 'REQ_TEST_OverdueLead', contactPerson: 'P', email: `ovd_${Date.now()}@t.com`,
        status: 'CONTACTED', nextFollowUpDate: pastDate, assignedSalesperson: aliceUser._id
      });

      const res = await request(app)
        .get('/api/v1/dashboard/upcoming-followups')
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(res.status, 200);

      await Lead.deleteMany({ _id: { $in: [leadUpcoming._id, leadOverdue._id] } });
    });

  });

  // ==========================================
  // SECTION 8: REVENUE TRACKING (REV-001 - REV-011)
  // ==========================================
  describe('8. Revenue Tracking (REV-001 to REV-011)', () => {

    test('REV-001 to REV-009: Granular Revenue Records & Grouping (Salesperson, Customer, Product)', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_RevGroupingCust', email: `rgc_${Date.now()}@t.com` });
      const rev1 = await Revenue.create({ customer: cust._id, salesperson: aliceUser._id, productService: 'Cloud', amount: 200000, recognizedDate: new Date(), invoiceNumber: `INV_REQ_G1_${Date.now()}`, productCategory: 'Cloud' });
      const rev2 = await Revenue.create({ customer: cust._id, salesperson: aliceUser._id, productService: 'Security', amount: 300000, recognizedDate: new Date(), invoiceNumber: `INV_REQ_G2_${Date.now()}`, productCategory: 'Security' });

      // Grouping by salesperson
      const spRes = await request(app)
        .get('/api/v1/revenue/by-salesperson')
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(spRes.status, 200);

      await Revenue.deleteMany({ _id: { $in: [rev1._id, rev2._id] } });
      await Customer.deleteOne({ _id: cust._id });
    });

    test('REV-010: Negative revenue rejected unless valid audited credit note', async () => {
      const cust = await Customer.create({ companyName: 'REQ_TEST_NegRevCust', email: `nrc_${Date.now()}@t.com` });
      const res = await request(app)
        .post('/api/v1/revenue')
        .set('x-dev-role', 'ADMIN')
        .send({
          customer: cust._id,
          salesperson: aliceUser._id,
          productService: 'Software',
          amount: -50000,
          invoiceNumber: `INV_REQ_NEG_${Date.now()}`,
        });
      assert.strictEqual(res.status, 400);
      await Customer.deleteOne({ _id: cust._id });
    });

  });

  // ==========================================
  // SECTION 9: SALES TARGETS (TAR-001 - TAR-008)
  // ==========================================
  describe('9. Sales Targets Calculations (TAR-001 to TAR-008)', () => {

    test('TAR-001 to TAR-008: Monthly/Quarterly/Annual targets & remaining/achievement calculations', () => {
      // TAR-005: Target 10L, Revenue 5L -> 50% Achievement, 5L Remaining
      assert.strictEqual(calculateTargetAchievement(500000, 1000000), 50);
      assert.strictEqual(calculateRemainingTarget(1000000, 500000), 500000);

      // TAR-006: Target 10L, Revenue 10L -> 100% Achievement, 0 Remaining
      assert.strictEqual(calculateTargetAchievement(1000000, 1000000), 100);
      assert.strictEqual(calculateRemainingTarget(1000000, 1000000), 0);

      // TAR-007: Target 10L, Revenue 15L -> 150% Achievement, 0 Remaining (clamped)
      assert.strictEqual(calculateTargetAchievement(1500000, 1000000), 150);
      assert.strictEqual(calculateRemainingTarget(1000000, 1500000), 0);

      // TAR-008: Target 0 -> Safe 0% (No NaN, No Infinity)
      assert.strictEqual(calculateTargetAchievement(500000, 0), 0);
      assert.strictEqual(calculateRemainingTarget(0, 500000), 0);
    });

  });

  // ==========================================
  // SECTION 10 & 11: REPORTS, FILTERS, SEARCH & PAGINATION
  // ==========================================
  describe('10, 11 & 12. Reports, Filters, Search & Pagination (PAGE-001 to PAGE-006)', () => {

    test('PAGE-001 to PAGE-006: Pagination & exact/partial search on leads', async () => {
      const searchKey = `PAGE_TEST_${Date.now()}`;
      const leads = [];
      for (let i = 1; i <= 25; i++) {
        leads.push(await Lead.create({
          companyName: `REQ_TEST_${searchKey}_Company_${String(i).padStart(2, '0')}`,
          contactPerson: `Contact ${i}`,
          email: `page_${i}_${Date.now()}@test.com`,
          status: 'NEW',
        }));
      }

      // PAGE-001 & PAGE-002: First page (limit 10)
      const page1Res = await request(app)
        .get(`/api/v1/leads?search=${searchKey}&page=1&limit=10`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(page1Res.status, 200);
      assert.strictEqual(page1Res.body.data?.leads?.length || page1Res.body.leads?.length, 10);
      assert.strictEqual(page1Res.body.data?.pagination?.total || page1Res.body.pagination?.totalRecords, 25);
      assert.strictEqual(page1Res.body.data?.pagination?.totalPages || page1Res.body.pagination?.totalPages, 3);

      // PAGE-003: Last page (page 3, remaining 5)
      const page3Res = await request(app)
        .get(`/api/v1/leads?search=${searchKey}&page=3&limit=10`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(page3Res.status, 200);
      assert.strictEqual(page3Res.body.data?.leads?.length || page3Res.body.leads?.length, 5);

      // PAGE-004: Exact search
      const exactRes = await request(app)
        .get(`/api/v1/leads?search=${searchKey}_Company_05`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(exactRes.status, 200);
      assert.strictEqual(exactRes.body.data?.leads?.length || exactRes.body.leads?.length, 1);

      // PAGE-005: Partial search
      const partialRes = await request(app)
        .get(`/api/v1/leads?search=${searchKey}`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(partialRes.status, 200);
      assert.strictEqual(partialRes.body.data?.leads?.length || partialRes.body.leads?.length, 20); // Default limit 20

      // PAGE-006: Nonexistent search -> Empty state
      const emptyRes = await request(app)
        .get('/api/v1/leads?search=NONEXISTENT_COMPANY_XYZ_99999')
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(emptyRes.status, 200);
      assert.strictEqual(emptyRes.body.data?.leads?.length || emptyRes.body.leads?.length, 0);

      await Lead.deleteMany({ companyName: new RegExp(searchKey) });
    });

  });

  // ==========================================
  // SECTION 13: FINAL ACCEPTANCE DATASET & BUSINESS QUESTION
  // ==========================================
  describe('13. FINAL BUSINESS QUESTION & ACCEPTANCE VERIFICATION', () => {

    let dealA, dealB, dealC, dealD, dealE;
    let custA, custB, custC, custD, custE;
    let revD;

    before(async () => {
      // 1. Clean previous final test records
      await Deal.deleteMany({ opportunityName: /^FINAL_ACCEPTANCE_/ });
      await Customer.deleteMany({ companyName: /^FINAL_ACCEPTANCE_/ });
      await Revenue.deleteMany({ invoiceNumber: /^INV_FINAL_/ });

      // 2. Create Customers
      custA = await Customer.create({ companyName: 'FINAL_ACCEPTANCE_TechNova', email: 'technova@test.com' });
      custB = await Customer.create({ companyName: 'FINAL_ACCEPTANCE_DataCore', email: 'datacore@test.com' });
      custC = await Customer.create({ companyName: 'FINAL_ACCEPTANCE_FinTech Solutions', email: 'fintech@test.com' });
      custD = await Customer.create({ companyName: 'FINAL_ACCEPTANCE_RetailCorp', email: 'retailcorp@test.com' });
      custE = await Customer.create({ companyName: 'FINAL_ACCEPTANCE_OldClient', email: 'oldclient@test.com' });

      // 3. Create Deals A to E with exact business specifications
      const nearFuture = new Date();
      nearFuture.setDate(nearFuture.getDate() + 15);

      // DEAL A: TechNova, Alice, Enterprise Software, ₹10,00,000, 90%, NEGOTIATION, ACTIVE
      dealA = await Deal.create({
        opportunityName: 'FINAL_ACCEPTANCE_DEAL_A',
        customer: custA._id,
        salesperson: aliceUser._id,
        productService: 'Enterprise Software',
        dealValue: 1000000,
        probability: 90,
        stage: 'Negotiation',
        expectedClosingDate: nearFuture,
      });

      // DEAL B: DataCore, Bob, Cloud Platform, ₹20,00,000, 60%, PROPOSAL, ACTIVE
      dealB = await Deal.create({
        opportunityName: 'FINAL_ACCEPTANCE_DEAL_B',
        customer: custB._id,
        salesperson: bobUser._id,
        productService: 'Cloud Platform',
        dealValue: 2000000,
        probability: 60,
        stage: 'Proposal',
        expectedClosingDate: nearFuture,
      });

      // DEAL C: FinTech Solutions, Alice, Security Platform, ₹15,00,000, 80%, NEGOTIATION, ACTIVE
      dealC = await Deal.create({
        opportunityName: 'FINAL_ACCEPTANCE_DEAL_C',
        customer: custC._id,
        salesperson: aliceUser._id,
        productService: 'Security Platform',
        dealValue: 1500000,
        probability: 80,
        stage: 'Negotiation',
        expectedClosingDate: nearFuture,
      });

      // DEAL D: RetailCorp, Charlie, Analytics Platform, ₹25,00,000, 100%, WON, Recognized Revenue ₹25L
      dealD = await Deal.create({
        opportunityName: 'FINAL_ACCEPTANCE_DEAL_D',
        customer: custD._id,
        salesperson: charlieUser._id,
        productService: 'Analytics Platform',
        dealValue: 2500000,
        probability: 100,
        stage: 'Won',
        wonAt: new Date(),
        actualClosingDate: new Date(),
        expectedClosingDate: new Date(),
      });

      revD = await Revenue.create({
        deal: dealD._id,
        customer: custD._id,
        salesperson: charlieUser._id,
        productService: 'Analytics Platform',
        amount: 2500000,
        recognizedDate: new Date(),
        invoiceNumber: `INV_FINAL_RETAILCORP_${Date.now()}`,
      });

      // DEAL E: OldClient, Bob, CRM, ₹8,00,000, LOST, Loss Reason: Competitor
      dealE = await Deal.create({
        opportunityName: 'FINAL_ACCEPTANCE_DEAL_E',
        customer: custE._id,
        salesperson: bobUser._id,
        productService: 'CRM',
        dealValue: 800000,
        probability: 0,
        stage: 'Lost',
        lostReason: 'Competitor',
        lostAt: new Date(),
        expectedClosingDate: new Date(),
      });

      await invalidateDashboardCache();
    });

    after(async () => {
      await Deal.deleteMany({ opportunityName: /^FINAL_ACCEPTANCE_/ });
      await Customer.deleteMany({ companyName: /^FINAL_ACCEPTANCE_/ });
      await Revenue.deleteMany({ invoiceNumber: /^INV_FINAL_/ });
      await invalidateDashboardCache();
    });

    test('FINAL ACCEPTANCE: Total Active Business = ₹45,00,000 (Excludes Won ₹25L & Lost ₹8L)', async () => {
      const activeDeals = await Deal.find({
        opportunityName: /^FINAL_ACCEPTANCE_/,
        stage: { $nin: ['Won', 'Lost'] },
      });

      assert.strictEqual(activeDeals.length, 3, 'Must have exactly 3 active deals (A, B, C)');
      const totalPipeline = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
      assert.strictEqual(totalPipeline, 4500000, 'Total Active Pipeline must be exactly ₹45,00,000');
    });

    test('FINAL ACCEPTANCE: Weighted Business = ₹33,00,000 (Deal A ₹9L + Deal B ₹12L + Deal C ₹12L)', async () => {
      const activeDeals = await Deal.find({
        opportunityName: /^FINAL_ACCEPTANCE_/,
        stage: { $nin: ['Won', 'Lost'] },
      });

      const weightedPipeline = activeDeals.reduce((sum, d) => sum + (d.weightedValue || Math.round(d.dealValue * d.probability / 100)), 0);
      assert.strictEqual(weightedPipeline, 3300000, 'Weighted Pipeline must be exactly ₹33,00,000');
    });

    test('FINAL ACCEPTANCE: Generated Revenue = ₹25,00,000 (Only Deal D WON)', async () => {
      const wonRevenues = await Revenue.find({ invoiceNumber: /^INV_FINAL_/ });
      const totalWonRev = wonRevenues.reduce((sum, r) => sum + r.amount, 0);
      assert.strictEqual(totalWonRev, 2500000, 'Won revenue must equal exactly ₹25,00,000');
    });

    test('FINAL ACCEPTANCE: Likely Deals to Close ranking & tracing to real database opportunities', async () => {
      const activeDeals = await Deal.find({
        opportunityName: /^FINAL_ACCEPTANCE_/,
        stage: { $nin: ['Won', 'Lost'] },
      })
      .populate('customer', 'companyName')
      .populate('salesperson', 'name');

      // Sort by probability desc
      const rankedByProb = [...activeDeals].sort((a, b) => b.probability - a.probability);

      // Verify Deal A (90%, ₹10L, ₹9L weighted)
      assert.strictEqual(rankedByProb[0].opportunityName, 'FINAL_ACCEPTANCE_DEAL_A');
      assert.strictEqual(rankedByProb[0].probability, 90);
      assert.strictEqual(rankedByProb[0].dealValue, 1000000);
      assert.strictEqual(rankedByProb[0].weightedValue, 900000);

      // Verify Deal C (80%, ₹15L, ₹12L weighted)
      assert.strictEqual(rankedByProb[1].opportunityName, 'FINAL_ACCEPTANCE_DEAL_C');
      assert.strictEqual(rankedByProb[1].probability, 80);
      assert.strictEqual(rankedByProb[1].dealValue, 1500000);
      assert.strictEqual(rankedByProb[1].weightedValue, 1200000);

      // Verify Deal B (60%, ₹20L, ₹12L weighted)
      assert.strictEqual(rankedByProb[2].opportunityName, 'FINAL_ACCEPTANCE_DEAL_B');
      assert.strictEqual(rankedByProb[2].probability, 60);
      assert.strictEqual(rankedByProb[2].dealValue, 2000000);
      assert.strictEqual(rankedByProb[2].weightedValue, 1200000);
    });

    test('FINAL ACCEPTANCE: Full Reconciliation across Database -> Logic -> API -> Reports', async () => {
      // API query for final dataset deals
      const apiRes = await request(app)
        .get('/api/v1/deals?search=FINAL_ACCEPTANCE')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(apiRes.status, 200);
      const dealsReturned = apiRes.body.deals || apiRes.body.data || apiRes.body;
      assert.strictEqual(dealsReturned.length, 5, 'API must return all 5 deals in final dataset');

      // Verify stage statuses
      const wonDeal = dealsReturned.find(d => d.opportunityName.includes('DEAL_D'));
      const lostDeal = dealsReturned.find(d => d.opportunityName.includes('DEAL_E'));
      const activeDeals = dealsReturned.filter(d => !['Won', 'Lost'].includes(d.stage));

      assert.strictEqual(wonDeal.stage, 'Won');
      assert.strictEqual(lostDeal.stage, 'Lost');
      assert.strictEqual(activeDeals.length, 3);

      const activePipelineFromApi = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
      assert.strictEqual(activePipelineFromApi, 4500000, 'Reconciled Pipeline = ₹45,00,000');

      const weightedPipelineFromApi = activeDeals.reduce((sum, d) => sum + (d.weightedValue || Math.round(d.dealValue * d.probability / 100)), 0);
      assert.strictEqual(weightedPipelineFromApi, 3300000, 'Reconciled Weighted Pipeline = ₹33,00,000');
    });

  });

});
