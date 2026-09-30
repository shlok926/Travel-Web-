import { randomUUID } from 'crypto';
import {
  NotificationProviderResult,
  SafeNotificationError,
} from '../../../../../shared/src/index.js';
import { EmailProviderAdapter, SendEmailRequest } from './emailProvider.adapter.js';

// ============================================================
// Phase 8 Step 3 — Mock Email Provider Implementation
// ============================================================

export interface SentEmailRecord {
  recipient: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  referenceId?: string;
  providerMessageId: string;
  sentAt: Date;
}

export class MockEmailProvider implements EmailProviderAdapter {
  public readonly providerName = 'MOCK_EMAIL_PROVIDER';

  private sentEmails: SentEmailRecord[] = [];
  private failureSimulation: SafeNotificationError | null = null;
  private shouldFailNext = false;

  /**
   * Simulates email delivery and returns deterministic provider result.
   */
  async sendEmail(request: SendEmailRequest): Promise<NotificationProviderResult> {
    if (this.shouldFailNext && this.failureSimulation) {
      const error = this.failureSimulation;
      this.shouldFailNext = false; // Reset single-shot failure
      return {
        success: false,
        providerName: this.providerName,
        statusCode: error.providerStatusCode ?? 500,
        error,
      };
    }

    const messageId = `<mock-${Date.now()}-${randomUUID().slice(0, 8)}@youngtours.local>`;

    this.sentEmails.push({
      recipient: request.recipient,
      subject: request.subject,
      htmlBody: request.htmlBody,
      plainTextBody: request.plainTextBody,
      referenceId: request.referenceId,
      providerMessageId: messageId,
      sentAt: new Date(),
    });

    return {
      success: true,
      providerName: this.providerName,
      providerMessageId: messageId,
      statusCode: 250,
    };
  }

  /**
   * Retrieves all emails sent by this mock provider instance.
   */
  getSentEmails(): SentEmailRecord[] {
    return [...this.sentEmails];
  }

  /**
   * Clears in-memory sent email history.
   */
  clearSentEmails(): void {
    this.sentEmails = [];
  }

  /**
   * Configures simulated error for the next email send attempt.
   */
  simulateFailure(error: SafeNotificationError): void {
    this.failureSimulation = error;
    this.shouldFailNext = true;
  }

  /**
   * Clears simulated failure configuration.
   */
  clearSimulation(): void {
    this.failureSimulation = null;
    this.shouldFailNext = false;
  }
}
