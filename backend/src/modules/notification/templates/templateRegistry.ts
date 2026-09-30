import { NotificationEventPayload } from '../../../../../shared/src/index.js';
import { RenderedNotification } from './notificationTemplate.js';
import { BookingConfirmedTemplate } from './bookingConfirmed.template.js';
import { DocumentReadyTemplate } from './documentReady.template.js';
import { RefundSettledTemplate } from './refundSettled.template.js';
import { BookingCancelledTemplate } from './bookingCancelled.template.js';

// ============================================================
// Phase 8 Step 4 — Notification Template Registry & Dispatcher
// ============================================================

export class NotificationTemplateRegistry {
  private readonly bookingConfirmedTemplate = new BookingConfirmedTemplate();
  private readonly documentReadyTemplate = new DocumentReadyTemplate();
  private readonly refundSettledTemplate = new RefundSettledTemplate();
  private readonly bookingCancelledTemplate = new BookingCancelledTemplate();

  /**
   * Renders a validated NotificationEventPayload into its respective email representation.
   */
  render(
    typeOrPayload: string | NotificationEventPayload,
    maybePayload?: NotificationEventPayload,
  ): RenderedNotification {
    const payload = (maybePayload ?? typeOrPayload) as NotificationEventPayload;
    switch (payload.type) {
      case 'BOOKING_CONFIRMED':
        return this.bookingConfirmedTemplate.render(payload);
      case 'DOCUMENT_READY':
        return this.documentReadyTemplate.render(payload);
      case 'REFUND_SETTLED':
        return this.refundSettledTemplate.render(payload);
      case 'BOOKING_CANCELLED':
        return this.bookingCancelledTemplate.render(payload);
      default: {
        const exhaustiveCheck: never = payload;
        throw new Error(
          `Unsupported notification payload type: ${JSON.stringify(exhaustiveCheck)}`,
        );
      }
    }
  }

  static render(
    typeOrPayload: string | NotificationEventPayload,
    maybePayload?: NotificationEventPayload,
  ): RenderedNotification {
    return notificationTemplateRegistry.render(typeOrPayload, maybePayload);
  }
}

export const notificationTemplateRegistry = new NotificationTemplateRegistry();
