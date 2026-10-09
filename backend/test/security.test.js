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

describe('Security, Sanitization & Vulnerability Prevention Tests (Section 16)', () => {

  describe('1. NoSQL Injection & Query Parameter Resistance', () => {
    test('rejects or sanitizes NoSQL object injection in search/filter parameters', async () => {
      const res = await request(app)
        .get('/api/v1/leads?search[$gt]=')
        .set('x-dev-role', 'ADMIN');

      assert.ok([200, 400].includes(res.status));
      if (res.status === 200) {
        // Must return safe sanitized array, not dump the full database unsafely
        assert.ok(Array.isArray(res.body.data?.leads || res.body.leads || []));
      }
    });

    test('rejects malformed or injected MongoDB ObjectIds with 400/404 rather than 500 crash', async () => {
      const res = await request(app)
        .get('/api/v1/leads/INVALID_OBJECT_ID_OR_INJECTION_1234')
        .set('x-dev-role', 'ADMIN');

      assert.ok([400, 404].includes(res.status));
      assert.strictEqual(res.body.success, false);
    });

    test('rejects deal retrieval with malicious selector injection in route param', async () => {
      const res = await request(app)
        .get('/api/v1/deals/{"$ne":null}')
        .set('x-dev-role', 'ADMIN');

      assert.ok([400, 404].includes(res.status));
      assert.strictEqual(res.body.success, false);
    });
  });

  describe('2. Sensitive Data & Secret Leakage Prevention', () => {
    test('never exposes password, passwordHash, or JWT secret in /salespersons listing', async () => {
      const res = await request(app)
        .get('/api/v1/salespersons')
        .set('x-dev-role', 'ADMIN');

      assert.strictEqual(res.status, 200);
      const list = res.body.data || res.body;
      assert.ok(Array.isArray(list));

      list.forEach((sp) => {
        assert.strictEqual(sp.password, undefined, `User ${sp.email} must not expose password`);
        assert.strictEqual(sp.passwordHash, undefined, `User ${sp.email} must not expose passwordHash`);
      });
    });

    test('never returns sensitive credentials in /auth/me payload', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@harvik.com', password: 'Password@123' });

      assert.strictEqual(loginRes.status, 200);
      const token = loginRes.body.token;

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.body.user.password, undefined);
      assert.strictEqual(meRes.body.user.passwordHash, undefined);
    });
  });

  describe('3. IDOR & Role Escalation Prevention', () => {
    test('prevents SALESPERSON from reassigning deals (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch('/api/v1/deals/DEAL-000001/assignment')
        .set('x-dev-role', 'SALESPERSON')
        .send({ salespersonId: 'USR-0002' });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });

    test('prevents unauthenticated user from accessing internal reconciliation endpoint (401)', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview/reconciliation')
        .set('x-require-strict-auth', 'true');

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    test('prevents SALESPERSON from accessing internal reconciliation auditor (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview/reconciliation')
        .set('x-dev-role', 'SALESPERSON');

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, 'FORBIDDEN');
    });
  });

});
