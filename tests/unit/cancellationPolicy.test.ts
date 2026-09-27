import { describe, it, expect } from 'vitest';
import { CancellationPolicyEvaluator } from '../../backend/src/modules/payment/services/cancellationPolicy.js';

describe('Phase 6 Step 10 — Cancellation Policy Evaluator (DEC-007)', () => {
  const evaluator = new CancellationPolicyEvaluator();

  it('should evaluate > 30 days tier: 90% refund and 10% penalty', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-07-15T00:00:00.000Z'); // 44 days ahead
    const totalPrice = 100000; // ₹1,000.00 (100000 paise)

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(90);
    expect(result.penaltyPercentage).toBe(10);
    expect(result.refundAmount).toBe(90000); // ₹900.00
    expect(result.penaltyAmount).toBe(10000); // ₹100.00
    expect(result.refundAmount + result.penaltyAmount).toBe(totalPrice);
  });

  it('should evaluate exactly 31 days tier: 90% refund and 10% penalty', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-07-02T12:00:00.000Z'); // 31.5 days ahead
    const totalPrice = 50000; // ₹500.00

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(90);
    expect(result.refundAmount).toBe(45000);
    expect(result.penaltyAmount).toBe(5000);
    expect(result.refundAmount + result.penaltyAmount).toBe(totalPrice);
  });

  it('should evaluate 15 to 30 days tier: 50% refund and 50% penalty at 30 days boundary', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-07-01T00:00:00.000Z'); // exactly 30.0 days ahead
    const totalPrice = 80000; // ₹800.00

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(50);
    expect(result.penaltyPercentage).toBe(50);
    expect(result.refundAmount).toBe(40000);
    expect(result.penaltyAmount).toBe(40000);
    expect(result.refundAmount + result.penaltyAmount).toBe(totalPrice);
  });

  it('should evaluate 15 to 30 days tier: 50% refund and 50% penalty at 15 days boundary', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-06-16T00:00:00.000Z'); // exactly 15.0 days ahead
    const totalPrice = 120000;

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(50);
    expect(result.refundAmount).toBe(60000);
    expect(result.penaltyAmount).toBe(60000);
    expect(result.refundAmount + result.penaltyAmount).toBe(totalPrice);
  });

  it('should evaluate 7 to 14 days tier: 25% refund and 75% penalty at 14 days', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-06-15T00:00:00.000Z'); // 14.0 days ahead
    const totalPrice = 100000;

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(25);
    expect(result.penaltyPercentage).toBe(75);
    expect(result.refundAmount).toBe(25000);
    expect(result.penaltyAmount).toBe(75000);
    expect(result.refundAmount + result.penaltyAmount).toBe(totalPrice);
  });

  it('should evaluate 7 to 14 days tier: 25% refund and 75% penalty at 7 days', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-06-08T00:00:00.000Z'); // exactly 7.0 days ahead
    const totalPrice = 200000;

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(25);
    expect(result.refundAmount).toBe(50000);
    expect(result.penaltyAmount).toBe(150000);
    expect(result.refundAmount + result.penaltyAmount).toBe(totalPrice);
  });

  it('should evaluate < 7 days tier: 0% refund and 100% penalty at 6 days', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-06-07T00:00:00.000Z'); // 6.0 days ahead
    const totalPrice = 150000;

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(0);
    expect(result.penaltyPercentage).toBe(100);
    expect(result.refundAmount).toBe(0);
    expect(result.penaltyAmount).toBe(150000);
    expect(result.refundAmount + result.penaltyAmount).toBe(totalPrice);
  });

  it('should evaluate same-day / 0 days before departure: 0% refund and 100% penalty', () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    const departure = new Date('2026-06-01T18:00:00.000Z'); // same day (8 hours ahead)
    const totalPrice = 150000;

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(0);
    expect(result.refundAmount).toBe(0);
    expect(result.penaltyAmount).toBe(150000);
  });

  it('should evaluate past departure: 0% refund and 100% penalty', () => {
    const now = new Date('2026-06-10T00:00:00.000Z');
    const departure = new Date('2026-06-01T00:00:00.000Z'); // 9 days in the past
    const totalPrice = 150000;

    const result = evaluator.evaluate(departure, totalPrice, now);

    expect(result.refundPercentage).toBe(0);
    expect(result.refundAmount).toBe(0);
    expect(result.penaltyAmount).toBe(150000);
  });

  it('should maintain exact minor-unit sum invariant with non-round prices and odd numbers', () => {
    const oddPrices = [1, 3, 7, 99, 1001, 33333, 99999, 1234567, 987654321, 1000000000];
    const now = new Date('2026-06-01T00:00:00.000Z');
    const departureTiers = [
      new Date('2026-07-15T00:00:00.000Z'), // > 30d (90%)
      new Date('2026-06-20T00:00:00.000Z'), // 15-30d (50%)
      new Date('2026-06-10T00:00:00.000Z'), // 7-14d (25%)
      new Date('2026-06-03T00:00:00.000Z'), // < 7d (0%)
    ];

    for (const price of oddPrices) {
      for (const dep of departureTiers) {
        const res = evaluator.evaluate(dep, price, now);
        expect(res.refundAmount + res.penaltyAmount).toBe(price);
        expect(Number.isInteger(res.refundAmount)).toBe(true);
        expect(Number.isInteger(res.penaltyAmount)).toBe(true);
        expect(res.refundAmount).toBeGreaterThanOrEqual(0);
        expect(res.penaltyAmount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('should support parameter-driven custom cancellation tiers', () => {
    const customEvaluator = new CancellationPolicyEvaluator({
      tiers: [
        { minDaysBeforeDeparture: 45, refundPercentage: 95, description: '> 45d: 95%' },
        { minDaysBeforeDeparture: 20, refundPercentage: 60, description: '20-45d: 60%' },
        { minDaysBeforeDeparture: 0, refundPercentage: 10, description: '< 20d: 10%' },
      ],
    });

    const now = new Date('2026-06-01T00:00:00.000Z');
    const departure = new Date('2026-07-20T00:00:00.000Z'); // 49 days ahead
    const res = customEvaluator.evaluate(departure, 100000, now);

    expect(res.refundPercentage).toBe(95);
    expect(res.refundAmount).toBe(95000);
    expect(res.penaltyAmount).toBe(5000);
  });
});
