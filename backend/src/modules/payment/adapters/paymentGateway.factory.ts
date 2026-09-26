import { PaymentGatewayAdapter } from './paymentGateway.adapter.js';
import { MockPaymentGatewayAdapter } from './mock.adapter.js';
import { RazorpayPaymentGatewayAdapter } from './razorpay.adapter.js';
import { StripePaymentGatewayAdapter } from './stripe.adapter.js';
import { EnvConfig } from '../../../config/env.js';
import { PaymentProvider, AppError, ErrorCodes } from '../../../../../shared/src/index.js';

export class PaymentGatewayFactory {
  private readonly adapters = new Map<string, PaymentGatewayAdapter>();
  private readonly defaultProvider: PaymentProvider;

  constructor(config: EnvConfig) {
    this.defaultProvider = config.DEFAULT_PAYMENT_PROVIDER ?? 'MOCK';

    // Register built-in adapters
    this.registerAdapter(new MockPaymentGatewayAdapter());
    this.registerAdapter(
      new RazorpayPaymentGatewayAdapter({
        keyId: config.RAZORPAY_KEY_ID,
        keySecret: config.RAZORPAY_KEY_SECRET,
      }),
    );
    this.registerAdapter(
      new StripePaymentGatewayAdapter({
        secretKey: config.STRIPE_SECRET_KEY,
        publishableKey: config.STRIPE_PUBLISHABLE_KEY,
      }),
    );
  }

  /**
   * Registers a payment gateway adapter.
   */
  public registerAdapter(adapter: PaymentGatewayAdapter): void {
    this.adapters.set(adapter.provider.toUpperCase(), adapter);
  }

  /**
   * Resolves the payment gateway adapter for the requested provider.
   * If no provider is requested, uses the default configured provider.
   */
  public getAdapter(provider?: string): PaymentGatewayAdapter {
    const selectedProvider = (provider || this.defaultProvider).toUpperCase();
    const adapter = this.adapters.get(selectedProvider);

    if (!adapter) {
      throw AppError.badRequest(
        `Unsupported payment provider: ${provider ?? this.defaultProvider}. Supported providers are: ${Array.from(this.adapters.keys()).join(', ')}`,
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    return adapter;
  }

  /**
   * Returns list of registered provider names.
   */
  public getRegisteredProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
}
