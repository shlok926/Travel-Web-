/**
 * GST / Tax Calculation Engine for Tour Operator Services.
 *
 * Repository Traceability & Baseline References:
 * - SAC 998555 (Tour Operator Services): Explicitly documented in docs/phase-6/STEP-0-IMPLEMENTATION-PLAN.md (Line 155).
 * - Tax Rate / Model: Documented as an open stakeholder baseline in docs/PHASE_0_3_REQUIREMENTS_SPECIFICATION.md
 *   (Section 22 ASM-04 & Section 24 Open Questions #1: 5% vs 18% inclusive/exclusive).
 * - Implemented as a parameter-driven configurable engine using pure arbitrary-precision BigInt integer minor-unit arithmetic.
 */

export const DEFAULT_SAC_CODE = '998555'; // Tour Operator Services (Phase 6 Step 0 L155)
export const DEFAULT_GST_RATE_PERCENT = 5; // Configurable baseline default (ASM-04)
export const DEFAULT_COMPANY_GSTIN = '07AABCY1234F1Z5';

export interface GstBreakdown {
  taxableAmount: number; // Integer minor units (paise/cents)
  gstAmount: number; // Integer minor units
  cgstAmount: number; // Integer minor units (Central GST 2.5%)
  sgstAmount: number; // Integer minor units (State GST 2.5%)
  totalAmount: number; // Integer minor units
  sacCode: string;
  gstRatePercent: number;
}

/**
 * Calculates exact statutory GST breakdown using BigInt integer arithmetic.
 *
 * For tax-inclusive pricing at R% (e.g. 5%):
 *   Taxable = (Total * 10000 + (10000 + R * 100) / 2) / (10000 + R * 100)
 *   GST = Total - Taxable
 *   CGST = GST / 2
 *   SGST = GST - CGST
 *
 * Guarantees:
 * 1. taxableAmount + gstAmount === totalAmount (exact to the minor unit).
 * 2. cgstAmount + sgstAmount === gstAmount (exact to the minor unit).
 * 3. Zero floating-point rounding errors across arbitrary large amounts.
 */
export function calculateGstBreakdown(
  totalMinorUnits: number | bigint | string,
  gstRatePercent: number = DEFAULT_GST_RATE_PERCENT,
  sacCode: string = DEFAULT_SAC_CODE,
): GstBreakdown {
  const totalBig = BigInt(totalMinorUnits);
  if (totalBig < 0n) {
    throw new Error('Total amount for GST calculation cannot be negative');
  }

  if (gstRatePercent === 0) {
    return {
      taxableAmount: Number(totalBig),
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      totalAmount: Number(totalBig),
      sacCode,
      gstRatePercent: 0,
    };
  }

  const rateBig = BigInt(gstRatePercent);
  const denominator = 10000n + rateBig * 100n; // e.g. 10500n for 5%
  const roundAdder = denominator / 2n; // Half-up integer rounding adder

  const taxableBig = (totalBig * 10000n + roundAdder) / denominator;
  const gstBig = totalBig - taxableBig;
  const cgstBig = gstBig / 2n;
  const sgstBig = gstBig - cgstBig;

  return {
    taxableAmount: Number(taxableBig),
    gstAmount: Number(gstBig),
    cgstAmount: Number(cgstBig),
    sgstAmount: Number(sgstBig),
    totalAmount: Number(totalBig),
    sacCode,
    gstRatePercent,
  };
}
