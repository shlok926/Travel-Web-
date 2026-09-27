// ============================================================
// Cancellation Policy Evaluator (DEC-007 Tiered Schedule)
// Authoritative Source: PHASE_0_3_REQUIREMENTS_SPECIFICATION.md & PHASE_0_2_PRODUCT_DEFINITION.md
// ============================================================

export interface CancellationTier {
  /** Minimum days (inclusive) prior to departure for this tier to apply */
  minDaysBeforeDeparture: number;
  /** Percentage of total price refunded to customer (0 to 100) */
  refundPercentage: number;
  /** Description for audit and display */
  description: string;
}

export interface CancellationCalculationResult {
  /** Exact refundable amount in integer minor units (paise/cents) */
  refundAmount: number;
  /** Exact penalty / agency cancellation fee in integer minor units */
  penaltyAmount: number;
  /** Percentage of refund applied (0 to 100) */
  refundPercentage: number;
  /** Percentage of penalty applied (0 to 100) */
  penaltyPercentage: number;
  /** Number of days before departure at evaluation time */
  daysBeforeDeparture: number;
  /** Tier description applied */
  tierDescription: string;
}

export interface CancellationPolicyConfig {
  /** Optional custom tiers, evaluated in descending order of minDaysBeforeDeparture */
  tiers?: CancellationTier[];
}

/**
 * Authoritative DEC-007 Canonical Tier Schedule:
 * - > 30 Days before Departure: 90% Refund (10% Processing Fee)
 * - 15 to 30 Days before Departure: 50% Refund (50% Cancellation Fee)
 * - 7 to 14 Days before Departure: 25% Refund (75% Cancellation Fee)
 * - < 7 Days before Departure / Past Departure: 0% Refund (100% Non-refundable)
 */
export const DEFAULT_CANCELLATION_TIERS: CancellationTier[] = [
  {
    minDaysBeforeDeparture: 30, // Strictly > 30 handled by floor/boundary logic
    refundPercentage: 90,
    description: '> 30 Days: 90% Refund (10% Fee)',
  },
  {
    minDaysBeforeDeparture: 15,
    refundPercentage: 50,
    description: '15-30 Days: 50% Refund (50% Fee)',
  },
  {
    minDaysBeforeDeparture: 7,
    refundPercentage: 25,
    description: '7-14 Days: 25% Refund (75% Fee)',
  },
  {
    minDaysBeforeDeparture: 0,
    refundPercentage: 0,
    description: '< 7 Days: 0% Refund (100% Non-refundable)',
  },
];

export class CancellationPolicyEvaluator {
  private readonly tiers: CancellationTier[];

  constructor(config: CancellationPolicyConfig = {}) {
    this.tiers = config.tiers ?? DEFAULT_CANCELLATION_TIERS;
  }

  /**
   * Evaluates cancellation refund and penalty using integer BigInt arithmetic.
   *
   * @param departureDate Departure date of the tour
   * @param totalPrice Total booking price in integer minor units
   * @param now Current timestamp (defaults to Date.now())
   */
  evaluate(
    departureDate: Date | string,
    totalPrice: number | bigint,
    now: Date = new Date(),
  ): CancellationCalculationResult {
    const depDate = departureDate instanceof Date ? departureDate : new Date(departureDate);
    const nowTime = now.getTime();
    const depTime = depDate.getTime();

    const diffMs = depTime - nowTime;
    const daysBeforeDeparture = diffMs / (1000 * 60 * 60 * 24);

    // Sort tiers descending by minDaysBeforeDeparture
    const sortedTiers = [...this.tiers].sort(
      (a, b) => b.minDaysBeforeDeparture - a.minDaysBeforeDeparture,
    );

    let selectedTier: CancellationTier = sortedTiers[sortedTiers.length - 1] ?? {
      minDaysBeforeDeparture: 0,
      refundPercentage: 0,
      description: '< 7 Days: 0% Refund (100% Non-refundable)',
    };

    if (daysBeforeDeparture > 30) {
      const tier30 = sortedTiers.find((t) => t.minDaysBeforeDeparture >= 30);
      if (tier30) {
        selectedTier = tier30;
      }
    } else {
      for (const tier of sortedTiers) {
        if (
          tier.minDaysBeforeDeparture < 30 &&
          daysBeforeDeparture >= tier.minDaysBeforeDeparture
        ) {
          selectedTier = tier;
          break;
        }
      }
    }

    const totalBigInt =
      typeof totalPrice === 'bigint' ? totalPrice : BigInt(Math.max(0, Math.round(totalPrice)));
    const refundPercentBigInt = BigInt(selectedTier.refundPercentage);

    // Exact integer minor unit division: (total * percentage) / 100n
    const refundAmountBigInt = (totalBigInt * refundPercentBigInt) / 100n;
    const penaltyAmountBigInt = totalBigInt - refundAmountBigInt;

    const refundAmount = Number(refundAmountBigInt);
    const penaltyAmount = Number(penaltyAmountBigInt);

    return {
      refundAmount,
      penaltyAmount,
      refundPercentage: selectedTier.refundPercentage,
      penaltyPercentage: 100 - selectedTier.refundPercentage,
      daysBeforeDeparture: Math.round(daysBeforeDeparture * 100) / 100,
      tierDescription: selectedTier.description,
    };
  }
}
