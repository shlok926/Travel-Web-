import { describe, it, expect } from 'vitest';
import { MoneyUtil } from '../../shared/src/utils/money.js';

describe('Monetary Minor Units Utility (MoneyUtil)', () => {
  it('should correctly convert decimal amounts to integer minor units', () => {
    const moneyInr = MoneyUtil.fromDecimal(45000.5, 'INR');
    expect(moneyInr.amount).toBe(4500050n);
    expect(moneyInr.currency).toBe('INR');

    const moneyUsd = MoneyUtil.fromDecimal(250.25, 'USD');
    expect(moneyUsd.amount).toBe(25025n);
    expect(moneyUsd.currency).toBe('USD');
  });

  it('should correctly convert minor units back to decimal numbers', () => {
    const money = MoneyUtil.fromMinorUnits(4500050n, 'INR');
    expect(MoneyUtil.toDecimal(money)).toBe(45000.5);
  });

  it('should accurately perform additions and subtractions without floating point errors', () => {
    const item1 = MoneyUtil.fromDecimal(19.99, 'USD'); // 1999 cents
    const item2 = MoneyUtil.fromDecimal(10.01, 'USD'); // 1001 cents

    const sum = MoneyUtil.add(item1, item2);
    expect(sum.amount).toBe(3000n);
    expect(MoneyUtil.toDecimal(sum)).toBe(30.0);

    const diff = MoneyUtil.subtract(sum, item1);
    expect(diff.amount).toBe(1001n);
  });

  it('should accurately calculate percentages (e.g. 18% GST / 5% Tax)', () => {
    const baseFare = MoneyUtil.fromDecimal(1000.0, 'INR'); // 100000 paise
    const gst = MoneyUtil.percentage(baseFare, 18);

    expect(gst.amount).toBe(18000n); // 180.00 INR
    expect(MoneyUtil.toDecimal(gst)).toBe(180.0);
  });

  it('should throw when operating on mismatched currencies', () => {
    const inr = MoneyUtil.fromDecimal(100, 'INR');
    const usd = MoneyUtil.fromDecimal(100, 'USD');

    expect(() => MoneyUtil.add(inr, usd)).toThrow(/Currency mismatch/);
  });

  it('should format money with proper currency symbols', () => {
    const inr = MoneyUtil.fromDecimal(45000, 'INR');
    expect(MoneyUtil.format(inr)).toContain('₹');

    const usd = MoneyUtil.fromDecimal(250, 'USD');
    expect(MoneyUtil.format(usd)).toContain('$');
  });
});
