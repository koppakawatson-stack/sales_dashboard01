const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');

before(async () => {
  await connectDB();
});

after(async () => {
  await mongoose.disconnect();
});

describe('Gateway Connectivity & All 6 Dashboard Endpoints Verification', () => {

  test('GET /health returns 200 with service health breakdown', async () => {
    const res = await request(app).get('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'healthy');
    assert.strictEqual(res.body.services.mongodb, 'healthy');
  });

  test('GET /api/v1/health returns 200 with service health breakdown', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'healthy');
    assert.strictEqual(res.body.services.mongodb, 'healthy');
  });

  test('1. GET /api/v1/dashboard/overview returns 200 with complete metrics', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/overview')
      .set('x-dev-role', 'ADMIN');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data);
    assert.ok(res.body.data.metrics);
  });

  test('2a. GET /api/v1/dashboard/person-performance returns 200 with leaderboard list', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/person-performance')
      .set('x-dev-role', 'ADMIN');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('2b. GET /api/v1/dashboard/salesperson-performance returns 200 with leaderboard list', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/salesperson-performance')
      .set('x-dev-role', 'ADMIN');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('3. GET /api/v1/dashboard/recent-activities returns 200 with activities array', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/recent-activities')
      .set('x-dev-role', 'ADMIN');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('4. GET /api/v1/revenue/trend returns 200 with monthly trend data', async () => {
    const res = await request(app)
      .get('/api/v1/revenue/trend')
      .set('x-dev-role', 'ADMIN');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('5. GET /api/v1/dashboard/upcoming-followups returns 200 with followups array', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/upcoming-followups')
      .set('x-dev-role', 'ADMIN');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  test('6. GET /api/v1/deals/pipeline/summary returns 200 with pipeline stage array', async () => {
    const res = await request(app)
      .get('/api/v1/deals/pipeline/summary')
      .set('x-dev-role', 'ADMIN');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

});
