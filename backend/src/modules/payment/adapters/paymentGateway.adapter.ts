import {
  PaymentProvider,
  PaymentStatus,
  SupportedCurrency,
  NormalizedPaymentResult,
} from '../../../../../shared/src/index.js';

// ============================================================
// 1. Provider-Neutral Gateway Input & Output Contracts
// ============================================================

export interface CreateGatewayOrderRequest {
  bookingReference: string;
  amount: number; // Server-authoritative integer minor units (paise/cents)
  currency: SupportedCurrency;
  receipt?: string; // Stable internal reference (e.g. payment_transactions UUID or idempotency key)
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  notes?: Record<string, string>;
}

export interface GatewayOrderResult {
  provider: PaymentProvider;
  gatewayOrderId: string;
  amount: number; // Minor units
  currency: SupportedCurrency;
  status: PaymentStatus;
  clientPayload: Record<string, unknown>; // Safe client initialization parameters for frontend modal
  rawPayload: Record<string, unknown>;
}

export interface VerifyPaymentRequest {
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  gatewaySignature?: string | null;
  amount: number; // Expected server-authoritative minor units
  currency: SupportedCurrency;
  rawPayload?: Record<string, unknown>;
}

export interface GetPaymentStatusRequest {
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
}

// ============================================================
// 2. Common Payment Gateway Adapter Interface
// ============================================================

export interface PaymentGatewayAdapter {
  readonly provider: PaymentProvider;

  /**
   * Creates a provider-specific order/intent using server-authoritative amount and currency.
   */
  createPaymentOrder(request: CreateGatewayOrderRequest): Promise<GatewayOrderResult>;

  /**
   * Verifies client payment completion or cryptographic signature.
   */
  verifyPayment(request: VerifyPaymentRequest): Promise<NormalizedPaymentResult>;

  /**
   * Fetches latest payment/order status from provider API.
   */
  getPaymentStatus(request: GetPaymentStatusRequest): Promise<NormalizedPaymentResult>;
}
