/**
 * Monetary representation and calculations using Integer Minor Units.
 * Prevents floating-point precision errors across pricing, bookings, and payments.
 *
 * Example:
 * ₹45,000.00 INR = 4,500,000 paise (minor units)
 * $250.00 USD = 25,000 cents (minor units)
 */

export type SupportedCurrency = 'INR' | 'USD';

export interface Money {
  readonly amount: bigint; // Integer in minor units (paise / cents)
  readonly currency: SupportedCurrency;
}

export class MoneyUtil {
  static readonly CURRENCY_DECIMALS: Record<SupportedCurrency, number> = {
    INR: 2,
    USD: 2,
  };

  static readonly CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
    INR: '₹',
    USD: '$',
  };

  /**
   * Create Money instance from integer minor units.
   */
  static fromMinorUnits(
    amount: number | bigint | string,
    currency: SupportedCurrency = 'INR',
  ): Money {
    const bigIntAmount = typeof amount === 'bigint' ? amount : BigInt(Math.round(Number(amount)));
    return { amount: bigIntAmount, currency };
  }

  /**
   * Create Money instance from standard decimal value (e.g. 450.50 -> 45050 paise).
   */
  static fromDecimal(decimalAmount: number, currency: SupportedCurrency = 'INR'): Money {
    if (!Number.isFinite(decimalAmount)) {
      throw new TypeError('Monetary decimal value must be a finite number');
    }
    const factor = Math.pow(10, this.CURRENCY_DECIMALS[currency]);
    const minorUnits = Math.round(decimalAmount * factor);
    return { amount: BigInt(minorUnits), currency };
  }

  /**
   * Convert Money instance to standard decimal number (e.g. 45050 paise -> 450.50).
   */
  static toDecimal(money: Money): number {
    const factor = Math.pow(10, this.CURRENCY_DECIMALS[money.currency]);
    return Number(money.amount) / factor;
  }

  /**
   * Add two Money values of the same currency.
   */
  static add(a: Money, b: Money): Money {
    this.assertMatchingCurrency(a, b);
    return { amount: a.amount + b.amount, currency: a.currency };
  }

  /**
   * Subtract Money b from Money a.
   */
  static subtract(a: Money, b: Money): Money {
    this.assertMatchingCurrency(a, b);
    return { amount: a.amount - b.amount, currency: a.currency };
  }

  /**
   * Multiply Money by a factor (e.g., party size or tax rate).
   */
  static multiply(money: Money, factor: number): Money {
    const result = Math.round(Number(money.amount) * factor);
    return { amount: BigInt(result), currency: money.currency };
  }

  /**
   * Calculate percentage of a Money value (e.g. 18% GST).
   */
  static percentage(money: Money, percentage: number): Money {
    const result = Math.round((Number(money.amount) * percentage) / 100);
    return { amount: BigInt(result), currency: money.currency };
  }

  /**
   * Format Money for localized UI display.
   */
  static format(money: Money): string {
    const decimal = this.toDecimal(money);
    const symbol = this.CURRENCY_SYMBOLS[money.currency];
    const formatted = decimal.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol}${formatted}`;
  }

  private static assertMatchingCurrency(a: Money, b: Money): void {
    if (a.currency !== b.currency) {
      throw new Error(`Currency mismatch: Cannot operate on ${a.currency} and ${b.currency}`);
    }
  }
}
