const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');
const Salesperson = require('../src/models/Salesperson');
const Customer = require('../src/models/Customer');
const Lead = require('../src/models/Lead');
const Activity = require('../src/models/Activity');
const AuditLog = require('../src/models/AuditLog');

let salespersonA;
let salespersonB;
let adminUser;
let testCustomer;
let testLead;

const cleanupTestData = async () => {
  const testActivities = await Activity.find({
    notes: {
      $in: [
        'Integration Test Activity Notes',
        'Lead Follow-up Call Notes',
        'Rep A Private Activity',
        'Stale Version Concurrency Test',
        'Activity to be Deleted',
        'Demo Presentation on Microservices',
      ],
    },
  });
  const actIds = testActivities.map(a => a._id);
  const busIds = testActivities.map(a => a.activityId).filter(Boolean);
  await Activity.deleteMany({ _id: { $in: actIds } });
  await AuditLog.deleteMany({ entityId: { $in: [...busIds, ...actIds.map(String)] } });
};

before(async () => {
  await connectDB();
  await cleanupTestData();

  salespersonA = await Salesperson.findOne({ email: 'rahul@harvik.com' });
  salespersonB = await Salesperson.findOne({ email: 'sneha@harvik.com' });
  adminUser = await Salesperson.findOne({ systemRole: 'ADMIN' });
  testCustomer = await Customer.findOne({ companyName: 'TechNova Pvt Ltd' });
  testLead = await Lead.findOne({ isDeleted: { $ne: true } });
});

after(async () => {
  await cleanupTestData();
  await mongoose.disconnect();
});

describe('Sales Activity Management Control Layer Integration & Negative Tests', () => {

  let testActivityId;
  let testActivityMongoId;

  describe('1. Activity Creation, Auto-ID & Audit Trail', () => {
    test('POST /api/v1/activities creates sales activity with auto-generated ACT-0000X format', async () => {
      const res = await request(app)
        .post('/api/v1/activities')
        .set('x-dev-role', 'ADMIN')
        .send({
          activityType: 'Meeting',
          customer: testCustomer._id.toString(),
          salesperson: salespersonA._id.toString(),
          date: '2026-10-07T14:30:00.000Z',
          duration: 45,
          notes: 'Integration Test Activity Notes',
          nextAction: 'Send technical architecture diagrams',
          nextActionDate: '2026-10-12',
          outcome: 'Positive',
          status: 'Completed',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.activityId, 'Must have activityId');
      assert.match(res.body.activityId, /^ACT-\d{5}$/, 'activityId must match ACT-0000X format');
      assert.strictEqual(res.body.activityType, 'Meeting');
      assert.strictEqual(res.body.notes, 'Integration Test Activity Notes');
      assert.strictEqual(res.body.nextAction, 'Send technical architecture diagrams');
      assert.strictEqual(res.body.duration, 45);
      assert.strictEqual(res.body.outcome, 'Positive');
      assert.strictEqual(res.body.status, 'Completed');

      testActivityId = res.body.activityId;
      testActivityMongoId = res.body._id;

      // Verify Audit Log
      const audit = await AuditLog.findOne({
        action: 'ACTIVITY_CREATED',
        entityId: testActivityId,
      });
      assert.ok(audit, 'Audit log must record ACTIVITY_CREATED');
      assert.strictEqual(audit.entityType, 'ACTIVITY');
    });

    test('POST /api/v1/activities supports Lead association', async () => {
      const res = await request(app)
        .post('/api/v1/activities')
        .set('x-dev-role', 'ADMIN')
        .send({
          activityType: 'Call',
          lead: testLead._id.toString(),
          salesperson: salespersonA._id.toString(),
          date: new Date().toISOString(),
          notes: 'Lead Follow-up Call Notes',
          nextAction: 'Schedule product demo with procurement team',
          outcome: 'Neutral',
          status: 'Completed',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.activityType, 'Call');
      assert.strictEqual(res.body.lead?._id || res.body.lead, testLead._id.toString());
    });
  });

  describe('2. Customer / Lead Requirement Controls', () => {
    test('Activity without Customer OR Lead is rejected (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/activities')
        .set('x-dev-role', 'ADMIN')
        .send({
          activityType: 'Call',
          salesperson: salespersonA._id.toString(),
          notes: 'Activity without any account association',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('Activity with invalid/non-existent Customer is rejected (400 CUSTOMER_NOT_FOUND)', async () => {
      const fakeMongoId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/v1/activities')
        .set('x-dev-role', 'ADMIN')
        .send({
          activityType: 'Demo',
          customer: fakeMongoId,
          salesperson: salespersonA._id.toString(),
          notes: 'Demo with fake customer',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'CUSTOMER_NOT_FOUND');
    });
  });

  describe('3. Tracking All 7 Activity Types & Stats Breakdown', () => {
    test('Activity Stats endpoint returns counts for all 7 required types', async () => {
      const res = await request(app)
        .get('/api/v1/activities/stats')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body), 'Stats must return an array');

      const expectedTypes = ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up', 'Proposal', 'Other'];
      expectedTypes.forEach(t => {
        const item = res.body.find(x => x._id === t);
        assert.ok(item, `Must contain stat for ${t}`);
        assert.ok(typeof item.count === 'number', `Count for ${t} must be numeric`);
      });
    });
  });

  describe('4. Salesperson Data Isolation & Role Scoping', () => {
    let repAActivity;

    test('Create activity owned by Salesperson A', async () => {
      const res = await request(app)
        .post('/api/v1/activities')
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', salespersonA._id.toString())
        .send({
          activityType: 'Demo',
          customer: testCustomer._id.toString(),
          notes: 'Rep A Private Activity',
          nextAction: 'Confirm security compliance sign-off',
        });

      assert.strictEqual(res.status, 201);
      repAActivity = res.body;
    });

    test('Salesperson A can view their own activity', async () => {
      const res = await request(app)
        .get(`/api/v1/activities/${repAActivity._id}`)
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', salespersonA._id.toString());

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.notes, 'Rep A Private Activity');
    });

    test('Salesperson B is BLOCKED (403 FORBIDDEN) from viewing Salesperson A activity', async () => {
      const res = await request(app)
        .get(`/api/v1/activities/${repAActivity._id}`)
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', salespersonB._id.toString());

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });

    test('Salesperson B query for activities only returns their own activities', async () => {
      const res = await request(app)
        .get('/api/v1/activities')
        .set('x-dev-role', 'SALESPERSON')
        .set('x-user-id', salespersonB._id.toString());

      assert.strictEqual(res.status, 200);
      const activities = res.body.activities || [];
      activities.forEach(a => {
        const spId = a.salesperson?._id || a.salesperson;
        assert.strictEqual(String(spId), salespersonB._id.toString());
      });
    });
  });

  describe('5. Optimistic Concurrency Control (Version Locking)', () => {
    let versionTestAct;

    test('Create activity with version 1', async () => {
      const res = await request(app)
        .post('/api/v1/activities')
        .set('x-dev-role', 'ADMIN')
        .send({
          activityType: 'Proposal',
          customer: testCustomer._id.toString(),
          salesperson: salespersonA._id.toString(),
          notes: 'Stale Version Concurrency Test',
          nextAction: 'Deliver proposal deck',
        });

      assert.strictEqual(res.status, 201);
      versionTestAct = res.body;
      assert.strictEqual(versionTestAct.version, 1);
    });

    test('First update succeeds with version: 1 and increments to version: 2', async () => {
      const res = await request(app)
        .patch(`/api/v1/activities/${versionTestAct._id}`)
        .set('x-dev-role', 'ADMIN')
        .send({
          version: 1,
          nextAction: 'Updated action after client review',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.version, 2);
      assert.strictEqual(res.body.nextAction, 'Updated action after client review');
    });

    test('Stale update with old version: 1 is rejected (409 ACTIVITY_VERSION_CONFLICT)', async () => {
      const res = await request(app)
        .patch(`/api/v1/activities/${versionTestAct._id}`)
        .set('x-dev-role', 'ADMIN')
        .send({
          version: 1, // Stale! Current is 2
          nextAction: 'This should be rejected due to stale version',
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.error.code, 'ACTIVITY_VERSION_CONFLICT');
    });
  });

  describe('6. Soft Delete and Audit Verification', () => {
    let actToDelete;

    test('Create activity to delete', async () => {
      const res = await request(app)
        .post('/api/v1/activities')
        .set('x-dev-role', 'ADMIN')
        .send({
          activityType: 'Other',
          customer: testCustomer._id.toString(),
          salesperson: salespersonA._id.toString(),
          notes: 'Activity to be Deleted',
        });

      assert.strictEqual(res.status, 201);
      actToDelete = res.body;
    });

    test('DELETE /api/v1/activities/:id soft-deletes the record and creates audit log', async () => {
      const res = await request(app)
        .delete(`/api/v1/activities/${actToDelete._id}`)
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify soft deleted in DB
      const dbDoc = await Activity.findById(actToDelete._id);
      assert.ok(dbDoc);
      assert.strictEqual(dbDoc.isDeleted, true);

      // Verify GET returns 404
      const getRes = await request(app)
        .get(`/api/v1/activities/${actToDelete._id}`)
        .set('x-dev-role', 'ADMIN');
      assert.strictEqual(getRes.status, 404);

      // Verify Audit Log
      const audit = await AuditLog.findOne({
        action: 'ACTIVITY_DELETED',
        entityId: actToDelete.activityId,
      });
      assert.ok(audit, 'Audit log must record ACTIVITY_DELETED');
    });
  });

});
