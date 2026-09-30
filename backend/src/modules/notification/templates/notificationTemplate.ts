// ============================================================
// Phase 8 Step 4 — Notification Template Abstraction Interface
// ============================================================

export interface RenderedNotification {
  subject: string;
  html: string;
  text: string;
}

export interface NotificationTemplate<TPayload> {
  /**
   * Deterministically renders a validated notification payload into HTML, plaintext, and subject.
   */
  render(payload: TPayload): RenderedNotification;
}
