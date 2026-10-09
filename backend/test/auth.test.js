const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/server');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

let adminToken = '';
let salespersonToken = '';

before(async () => {
  await connectDB();
  // Ensure test users exist
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('Password@123', 10);
  
  await User.findOneAndUpdate(
    { email: 'admin@harvik.com' },
    {
      userId: 'USR-0006',
      name: 'Admin Manager',
      email: 'admin@harvik.com',
      phone: '+91 9876543200',
      department: 'Sales Management',
      role: 'Sales Manager',
      systemRole: 'SALES_MANAGER',
      status: 'ACTIVE',
      isActive: true,
      password: hash,
    },
    { upsert: true, returnDocument: 'after' }
  );

  await User.findOneAndUpdate(
    { email: 'rahul@harvik.com' },
    {
      userId: 'USR-0003',
      name: 'Rahul Mehta',
      email: 'rahul@harvik.com',
      phone: '+91 9876543212',
      department: 'Enterprise Sales',
      role: 'Account Executive',
      systemRole: 'SALESPERSON',
      status: 'ACTIVE',
      isActive: true,
      password: hash,
    },
    { upsert: true, returnDocument: 'after' }
  );

  await User.findOneAndUpdate(
    { email: 'disabled@harvik.com' },
    {
      userId: 'USR-0099',
      name: 'Disabled User',
      email: 'disabled@harvik.com',
      status: 'DISABLED',
      isActive: false,
      password: hash,
    },
    { upsert: true, returnDocument: 'after' }
  );

});

after(async () => {
  await mongoose.disconnect();
});

describe('Authentication & User Profile Control Tests', () => {

  describe('1. POST /api/v1/auth/login — Credentials Validation', () => {

    test('valid login returns 200, JWT token, and safe user profile for Admin Manager', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@harvik.com',
          password: 'Password@123',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token, 'Must return JWT token');
      adminToken = res.body.token;

      const user = res.body.user;
      assert.ok(user);
      assert.strictEqual(user.name, 'Admin Manager');
      assert.strictEqual(user.email, 'admin@harvik.com');
      assert.strictEqual(user.role, 'SALES_MANAGER');
      assert.strictEqual(user.displayRole, 'Sales Manager');
      assert.strictEqual(user.status, 'ACTIVE');

      // CRITICAL SECURITY: Ensure password and hash are never returned
      assert.strictEqual(user.password, undefined);
      assert.strictEqual(user.passwordHash, undefined);
      assert.strictEqual(res.body.password, undefined);
      assert.strictEqual(res.body.passwordHash, undefined);
    });

    test('valid login returns 200 for Salesperson (Rahul Mehta)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'rahul@harvik.com',
          password: 'Password@123',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
      salespersonToken = res.body.token;

      const user = res.body.user;
      assert.strictEqual(user.name, 'Rahul Mehta');
      assert.strictEqual(user.role, 'SALESPERSON');
    });


    test('invalid password returns 401 with generic error message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@harvik.com',
          password: 'WrongPassword!',
        });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.message, 'Invalid email or password.');
    });

    test('unknown email returns 401 with generic error message', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@harvik.com',
          password: 'Password@123',
        });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.message, 'Invalid email or password.');
    });

    test('disabled account returns 403', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'disabled@harvik.com',
          password: 'Password@123',
        });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'ACCOUNT_DISABLED');
    });

    test('missing email or password returns 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@harvik.com' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });
  });

  describe('2. GET /api/v1/auth/me — Current User Details', () => {

    test('returns 200 with authenticated Admin Manager details', async () => {
      // Login to get fresh token
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@harvik.com', password: 'Password@123' });
      const token = loginRes.body.token;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.name, 'Admin Manager');
      assert.strictEqual(res.body.user.email, 'admin@harvik.com');
      assert.strictEqual(res.body.user.role, 'SALES_MANAGER');
      assert.strictEqual(res.body.user.displayRole, 'Sales Manager');

      // Security assertion
      assert.strictEqual(res.body.user.password, undefined);
      assert.strictEqual(res.body.user.passwordHash, undefined);
    });

    test('returns 200 with authenticated Salesperson (Rahul Mehta) details', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'rahul@harvik.com', password: 'Password@123' });
      const token = loginRes.body.token;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.name, 'Rahul Mehta');
      assert.strictEqual(res.body.user.role, 'SALESPERSON');
    });


    test('rejects unauthenticated request with 401 when strict auth is active', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('x-require-strict-auth', 'true');

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    test('rejects invalid or malformed bearer token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-xyz');

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });
  });

  describe('3. POST /api/v1/auth/logout', () => {
    test('successfully logs out and records audit', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@harvik.com', password: 'Password@123' });
      const token = loginRes.body.token;

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Logged out successfully.');
    });
  });

});
