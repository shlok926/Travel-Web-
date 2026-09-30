import { NotificationProviderResult } from '../../../../../shared/src/index.js';

// ============================================================
// Phase 8 Step 3 — Email Provider Adapter Interface
// ============================================================

export interface SendEmailRequest {
  recipient: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  referenceId?: string;
}

export interface EmailProviderAdapter {
  readonly providerName: string;

  /**
   * Sends a transactional email and returns a canonical normalized provider result.
   */
  sendEmail(request: SendEmailRequest): Promise<NotificationProviderResult>;
}
