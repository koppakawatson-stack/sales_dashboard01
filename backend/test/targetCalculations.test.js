const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calculateAchievement, calculateRemainingTarget } = require('../src/utils/calculations');

describe('Sales Target Mathematical Formulas & Boundary Tests (Section 11)', () => {

  describe('1. Target Achievement Percentage Formula: (Achieved / Target) * 100', () => {

    test('Case 1: Target ₹10,00,000, revenue ₹0 -> 0% achievement', () => {
      const result = calculateAchievement(0, 1000000);
      assert.strictEqual(result, 0);
    });

    test('Case 2: Target ₹10,00,000, revenue ₹5,00,000 -> 50% achievement', () => {
      const result = calculateAchievement(500000, 1000000);
      assert.strictEqual(result, 50);
    });

    test('Case 3: Target ₹10,00,000, revenue ₹10,00,000 -> 100% achievement', () => {
      const result = calculateAchievement(1000000, 1000000);
      assert.strictEqual(result, 100);
    });

    test('Case 4: Target ₹10,00,000, revenue ₹15,00,000 -> 150% achievement (Overachievement)', () => {
      const result = calculateAchievement(1500000, 1000000);
      assert.strictEqual(result, 150);
    });

    test('Case 5: Target ₹0, revenue ₹5,00,000 -> safe 0% (prevents NaN / Infinity division by zero)', () => {
      const result = calculateAchievement(500000, 0);
      assert.strictEqual(result, 0);
      assert.ok(!Number.isNaN(result));
      assert.ok(Number.isFinite(result));
    });

    test('handles negative revenue or target gracefully by clamping to valid positive number', () => {
      const result = calculateAchievement(-50000, 1000000);
      assert.strictEqual(result, 0);
    });
  });

  describe('2. Remaining Target Formula: MAX(Target - Achieved, 0)', () => {

    test('Target ₹10,00,000, revenue ₹0 -> ₹10,00,000 remaining', () => {
      const remaining = calculateRemainingTarget(1000000, 0);
      assert.strictEqual(remaining, 1000000);
    });

    test('Target ₹10,00,000, revenue ₹5,00,000 -> ₹5,00,000 remaining', () => {
      const remaining = calculateRemainingTarget(1000000, 500000);
      assert.strictEqual(remaining, 500000);
    });

    test('Target ₹10,00,000, revenue ₹10,00,000 -> ₹0 remaining', () => {
      const remaining = calculateRemainingTarget(1000000, 1000000);
      assert.strictEqual(remaining, 0);
    });

    test('Target ₹10,00,000, revenue ₹15,00,000 -> ₹0 remaining (never negative)', () => {
      const remaining = calculateRemainingTarget(1000000, 1500000);
      assert.strictEqual(remaining, 0);
    });

    test('Target ₹0, revenue ₹5,00,000 -> ₹0 remaining', () => {
      const remaining = calculateRemainingTarget(0, 500000);
      assert.strictEqual(remaining, 0);
    });
  });

});
