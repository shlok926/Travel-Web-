import { escapeHtml, formatPrice, formatDuration } from '../utils/formatters.js';
import { api } from '../api/client.js';

/**
 * Controller for viewing single Booking Details, managing Payment, Document Downloads, and Cancellation/Refund Lifecycle.
 */
export class BookingDetailModal {
  static currentBooking = null;
  static currentPayment = null;
  static currentCancellation = null;
  static holdTimerInterval = null;
  static paymentPollingInterval = null;
  static isPaying = false;
  static isCancelling = false;
  static selectedProvider = 'MOCK';

  static getContainer() {
    return document.getElementById('booking-detail-modal');
  }

  /**
   * Open modal and load booking by reference
   * @param {string} reference
   */
  static async open(reference) {
    const container = this.getContainer();
    if (!container || !reference) return;

    this.clearIntervals();
    this.isPaying = false;
    this.isCancelling = false;
    container.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    container.innerHTML = `
      <div class="modal-card detail-modal-card" role="document">
        <button type="button" class="modal-close-btn" id="detail-modal-close" aria-label="Close booking details">&times;</button>
        <div class="booking-modal-body">
          <div class="departures-loading-spinner">
            <span class="status-anim-spinner">🔄</span> Loading booking details & records...
          </div>
        </div>
      </div>
    `;

    container.querySelector('#detail-modal-close')?.addEventListener('click', () => this.close());

    try {
      const [bookingRes, paymentRes, cancellationRes] = await Promise.all([
        api.getBookingByReference(reference),
        api.getPaymentStatus(reference, { silent: true }).catch(() => null),
        api.getCancellationDetails(reference, { silent: true }).catch(() => null),
      ]);

      const booking = bookingRes?.data || bookingRes;
      const payment = paymentRes?.data || paymentRes;
      const cancellation = cancellationRes?.data || cancellationRes;

      this.currentBooking = booking;
      this.currentPayment = payment;
      this.currentCancellation = cancellation;

      this.renderBooking(booking, payment, cancellation);
    } catch (err) {
      container.innerHTML = `
        <div class="modal-card detail-modal-card" role="document">
          <button type="button" class="modal-close-btn" id="detail-modal-close" aria-label="Close booking details">&times;</button>
          <div class="booking-modal-body">
            <div class="party-alert-box party-alert-warning">
              <span>⚠️ Failed to load booking details: ${escapeHtml(err.message || 'Booking not found')}</span>
            </div>
            <div style="text-align: center; margin-top: 1.5rem;">
              <button type="button" class="btn-secondary" id="btn-close-error">Close</button>
            </div>
          </div>
        </div>
      `;
      container.querySelector('#detail-modal-close')?.addEventListener('click', () => this.close());
      container.querySelector('#btn-close-error')?.addEventListener('click', () => this.close());
    }
  }

  static clearIntervals() {
    if (this.holdTimerInterval) {
      clearInterval(this.holdTimerInterval);
      this.holdTimerInterval = null;
    }
    if (this.paymentPollingInterval) {
      clearInterval(this.paymentPollingInterval);
      this.paymentPollingInterval = null;
    }
  }

  /**
   * Render loaded booking details, payment status, documents, and cancellation/refund info
   * @param {object} booking
   * @param {object} [payment]
   * @param {object} [cancellation]
   */
  static renderBooking(booking, payment = null, cancellation = null) {
    const container = this.getContainer();
    if (!container) return;

    const ref = escapeHtml(booking.bookingReference);
    const status = booking.status;
    const pkg = booking.packageSnapshot || {};
    const dep = booking.departureSnapshot || {};
    const primary = booking.primaryContact || {};
    const roster = Array.isArray(booking.passengers) ? booking.passengers : [];
    const totalPrice = formatPrice(booking.totalPrice, booking.currency);
    const duration = formatDuration(pkg.durationDays, pkg.durationNights);

    let statusBadgeClass = 'badge-warning';
    if (status === 'CONFIRMED') {
      statusBadgeClass = 'badge-available';
    } else if (status === 'CANCELLED') {
      statusBadgeClass = 'badge-cancelled';
    } else if (status === 'EXPIRED') {
      statusBadgeClass = 'badge-sold-out';
    }

    const isConfirmed = status === 'CONFIRMED';
    const isAwaitingPayment = status === 'AWAITING_PAYMENT';
    const isCancelled = status === 'CANCELLED';

    const cancelReq = cancellation?.request || null;
    const settlements = Array.isArray(cancellation?.settlements) ? cancellation.settlements : [];
    const latestSettlement = settlements[0] || null;

    container.innerHTML = `
      <div class="modal-card detail-modal-card" role="document">
        <button type="button" class="modal-close-btn" id="detail-modal-close" aria-label="Close booking details">&times;</button>
        
        <div class="booking-modal-header">
          <div class="booking-header-top-row">
            <span class="badge ${statusBadgeClass}" id="detail-status-badge">${escapeHtml(status)}</span>
            <span class="booking-ref-text">Ref: <strong>${ref}</strong></span>
          </div>
          <h2 class="booking-header-title">${escapeHtml(pkg.title || 'Tour Package')}</h2>
          <div class="booking-header-dates">
            <span>⏱️ ${duration} | 📍 ${escapeHtml(pkg.destinationCity || 'India')}, ${escapeHtml(pkg.destinationCountry || 'India')}</span>
          </div>
        </div>

        <div class="booking-modal-body">
          <!-- Notification Alert Container -->
          <div id="detail-alert-box" class="party-alert-box hidden" role="alert"></div>

          ${
            isAwaitingPayment && booking.holdExpiresAt
              ? `
            <div class="hold-countdown-banner" id="detail-hold-banner">
              <div class="countdown-icon" aria-hidden="true">⏳</div>
              <div class="countdown-content">
                <span class="countdown-label">15-Minute Reservation Hold Active:</span>
                <span class="countdown-timer" id="detail-hold-timer">Calculating remaining hold...</span>
              </div>
            </div>
          `
              : ''
          }

          <!-- Schedule & Summary -->
          <div class="booking-section">
            <h4 class="booking-section-title">Trip Schedule</h4>
            <div class="summary-details-grid">
              <div><strong>Departure Date:</strong> ${escapeHtml(dep.departureDate || 'N/A')}</div>
              <div><strong>Return Date:</strong> ${escapeHtml(dep.returnDate || 'N/A')}</div>
              <div><strong>Total Party:</strong> ${booking.partySize} (${booking.adultCount} Adults, ${booking.childCount} Children)</div>
              <div><strong>Primary Contact:</strong> ${escapeHtml(primary.name)} (${escapeHtml(primary.email)}, ${escapeHtml(primary.phone)})</div>
            </div>
          </div>

          <!-- Passenger Roster Table -->
          <div class="booking-section">
            <h4 class="booking-section-title">Passenger Details</h4>
            <div class="passenger-details-table-wrap">
              <table class="passenger-details-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Age</th>
                    <th>Gender</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  ${roster
                    .map(
                      (p, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td><strong>${escapeHtml(p.fullName)}</strong></td>
                      <td>${p.passengerType === 'ADULT' ? 'Adult' : 'Child'}</td>
                      <td>${p.ageAtBooking}</td>
                      <td>${escapeHtml(p.gender)}</td>
                      <td>${p.isPrimaryContact ? '<span class="chip chip-sm chip-tier">Primary Contact</span>' : 'Traveller'}</td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Financial Summary -->
          <div class="booking-section">
            <h4 class="booking-section-title">Financial Summary</h4>
            <div class="price-breakdown-card">
              <div class="ref-row">
                <span>Adults (${booking.adultCount} &times; ${formatPrice(booking.priceBreakdown?.adultUnitPrice || dep.pricingApplied?.basePriceAdult || 0, booking.currency)}):</span>
                <span>${formatPrice(booking.priceBreakdown?.adultSubtotal || 0, booking.currency)}</span>
              </div>
              ${
                booking.childCount > 0
                  ? `
                <div class="ref-row">
                  <span>Children (${booking.childCount} &times; ${formatPrice(booking.priceBreakdown?.childUnitPrice || dep.pricingApplied?.basePriceChild || 0, booking.currency)}):</span>
                  <span>${formatPrice(booking.priceBreakdown?.childSubtotal || 0, booking.currency)}</span>
                </div>
              `
                  : ''
              }
              <div class="ref-row grand-total-row">
                <strong>Total Amount:</strong>
                <strong class="ref-price">${totalPrice}</strong>
              </div>
            </div>
          </div>

          <!-- Fulfillment Documents Section (For Confirmed or Settled Bookings) -->
          ${
            isConfirmed || isCancelled
              ? `
            <div class="booking-section">
              <h4 class="booking-section-title">Travel Documents & Receipts</h4>
              <div class="document-actions-group">
                <button type="button" class="btn-doc-download" id="btn-detail-invoice" data-ref="${ref}">
                  📄 Download GST Tax Invoice
                </button>
                <button type="button" class="btn-doc-download" id="btn-detail-voucher" data-ref="${ref}">
                  🎫 Download E-Ticket Voucher
                </button>
              </div>
            </div>
          `
              : ''
          }

          <!-- Awaiting Payment Checkout Section -->
          ${
            isAwaitingPayment
              ? `
            <div class="payment-checkout-card" id="detail-payment-checkout">
              <div class="payment-section-title">
                <span>💳</span> Complete Payment
              </div>
              <div class="payment-provider-grid">
                <div class="payment-provider-card ${this.selectedProvider === 'MOCK' ? 'selected' : ''}" data-provider="MOCK">
                  <span class="payment-provider-name">Instant Simulator</span>
                  <span class="payment-provider-desc">Mock Sandbox Gateway</span>
                </div>
                <div class="payment-provider-card ${this.selectedProvider === 'STRIPE' ? 'selected' : ''}" data-provider="STRIPE">
                  <span class="payment-provider-name">Stripe</span>
                  <span class="payment-provider-desc">Cards & Global</span>
                </div>
                <div class="payment-provider-card ${this.selectedProvider === 'RAZORPAY' ? 'selected' : ''}" data-provider="RAZORPAY">
                  <span class="payment-provider-name">Razorpay</span>
                  <span class="payment-provider-desc">UPI, NetBanking, Cards</span>
                </div>
              </div>
              <button type="button" class="btn-primary" id="btn-detail-pay" style="width: 100%; padding: 0.85rem;">
                Pay ${totalPrice} & Confirm Booking &rarr;
              </button>
            </div>
            <div id="detail-payment-status-container"></div>
          `
              : ''
          }

          <!-- Cancellation & Refund Status Section -->
          ${
            cancelReq || booking.cancellationReason
              ? `
            <div class="booking-section">
              <h4 class="booking-section-title">Cancellation & Refund Status</h4>
              <div class="cancellation-review-card">
                <div class="cancellation-review-title">
                  <span>${
                    cancelReq?.status === 'COMPLETED' || booking.status === 'CANCELLED'
                      ? '✅ Cancellation Completed'
                      : cancelReq?.status === 'AUTHORIZED'
                        ? '🔄 Refund Processing'
                        : cancelReq?.status === 'REJECTED'
                          ? '❌ Cancellation Rejected'
                          : '⏳ Pending Approval'
                  }</span>
                  <span class="badge ${
                    cancelReq?.status === 'COMPLETED' || booking.status === 'CANCELLED'
                      ? 'badge-settled'
                      : cancelReq?.status === 'AUTHORIZED'
                        ? 'badge-processing'
                        : cancelReq?.status === 'REJECTED'
                          ? 'badge-cancelled'
                          : 'badge-pending-approval'
                  }">${cancelReq?.status || booking.status}</span>
                </div>
                <div class="cancellation-review-content">
                  <div><strong>Reason:</strong> ${escapeHtml(cancelReq?.cancellationReason || booking.cancellationReason || '')}</div>
                  ${cancelReq?.calculatedRefundAmount !== undefined ? `<div><strong>Calculated Refund Amount:</strong> ${formatPrice(cancelReq.calculatedRefundAmount, booking.currency)}</div>` : ''}
                  ${cancelReq?.calculatedPenaltyAmount !== undefined ? `<div><strong>Cancellation Penalty:</strong> ${formatPrice(cancelReq.calculatedPenaltyAmount, booking.currency)}</div>` : ''}
                  ${cancelReq?.adminNotes ? `<div><strong>Admin Notes:</strong> ${escapeHtml(cancelReq.adminNotes)}</div>` : ''}
                </div>

                ${
                  cancelReq?.status === 'AUTHORIZED' &&
                  latestSettlement?.settlementStatus === 'PROCESSING'
                    ? `
                  <div class="refund-processing-notice">
                    <strong>Refund In-Flight:</strong> Authorization approved; payment gateway refund is currently processing asynchronously. Your booking remains active and valid until financial settlement is confirmed by the gateway.
                  </div>
                `
                    : ''
                }
              </div>
            </div>
          `
              : ''
          }

          <!-- In-Modal Cancellation Request Form (Hidden by Default) -->
          <div id="cancellation-form-container" class="hidden">
            <div class="booking-section">
              <h4 class="booking-section-title">Request Tour Cancellation</h4>
              <div class="cancellation-review-card">
                <p style="margin-bottom: 0.75rem; font-size: 0.88rem;">
                  Refunds are evaluated under the <strong>DEC-007 Authoritative Policy</strong> based on the departure date schedule:
                  <br/>• &gt; 30 days: 90% refund (10% fee)
                  <br/>• 15–30 days: 50% refund (50% fee)
                  <br/>• 7–14 days: 25% refund (75% fee)
                  <br/>• &lt; 7 days: 0% refund (100% fee)
                </p>
                <div class="form-group" style="margin-bottom: 0.75rem;">
                  <label for="cancellation-reason-input" style="display: block; font-weight: 600; font-size: 0.88rem; margin-bottom: 0.25rem;">
                    Reason for Cancellation <span style="color: #ef4444;">*</span>:
                  </label>
                  <textarea
                    id="cancellation-reason-input"
                    class="filter-input"
                    rows="3"
                    placeholder="Please tell us why you wish to cancel this booking..."
                    style="width: 100%; border-radius: 8px;"
                  ></textarea>
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                  <button type="button" class="btn-secondary" id="btn-cancel-cancellation-form">Back</button>
                  <button type="button" class="btn-danger" id="btn-submit-cancellation-form">Submit Cancellation Request</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="booking-modal-footer">
          ${
            isConfirmed && !cancelReq
              ? `<button type="button" class="btn-danger" id="btn-trigger-cancel">Request Cancellation</button>`
              : ''
          }
          <button type="button" class="btn-primary" id="btn-close-detail">Close</button>
        </div>
      </div>
    `;

    // Start timer if awaiting payment
    if (isAwaitingPayment && booking.holdExpiresAt) {
      const expiresAt = new Date(booking.holdExpiresAt).getTime();
      const updateTimer = () => {
        const display = document.getElementById('detail-hold-timer');
        if (!display) return;
        const rem = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        if (rem <= 0) {
          display.innerHTML = '<span class="timer-expired">Hold Expired</span>';
          if (this.holdTimerInterval) {
            clearInterval(this.holdTimerInterval);
            this.holdTimerInterval = null;
          }
          return;
        }
        const m = Math.floor(rem / 60);
        const s = rem % 60;
        display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} remaining to confirm`;
      };
      updateTimer();
      this.holdTimerInterval = setInterval(updateTimer, 1000);
    }

    // Provider selection listeners
    container.querySelectorAll('.payment-provider-card').forEach((card) => {
      card.addEventListener('click', () => {
        container
          .querySelectorAll('.payment-provider-card')
          .forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedProvider = card.getAttribute('data-provider') || 'MOCK';
      });
    });

    // Payment initiation from detail view
    container.querySelector('#btn-detail-pay')?.addEventListener('click', () => {
      this.handleInitiatePayment(booking, this.selectedProvider);
    });

    // Document download listeners
    container.querySelector('#btn-detail-invoice')?.addEventListener('click', (e) => {
      this.handleDownloadDocument(booking.bookingReference, 'invoice', e.currentTarget);
    });
    container.querySelector('#btn-detail-voucher')?.addEventListener('click', (e) => {
      this.handleDownloadDocument(booking.bookingReference, 'voucher', e.currentTarget);
    });

    // Cancellation trigger listener
    const triggerCancelBtn = container.querySelector('#btn-trigger-cancel');
    const cancelFormContainer = container.querySelector('#cancellation-form-container');
    if (triggerCancelBtn && cancelFormContainer) {
      triggerCancelBtn.addEventListener('click', () => {
        cancelFormContainer.classList.remove('hidden');
        triggerCancelBtn.classList.add('hidden');
        cancelFormContainer.scrollIntoView({ behavior: 'smooth' });
      });
    }

    container.querySelector('#btn-cancel-cancellation-form')?.addEventListener('click', () => {
      if (cancelFormContainer && triggerCancelBtn) {
        cancelFormContainer.classList.add('hidden');
        triggerCancelBtn.classList.remove('hidden');
      }
    });

    container.querySelector('#btn-submit-cancellation-form')?.addEventListener('click', () => {
      const reasonInput = document.getElementById('cancellation-reason-input');
      const reason = reasonInput ? reasonInput.value.trim() : '';
      if (!reason) {
        this.showAlert('Please provide a reason for cancellation', 'warning');
        return;
      }
      this.handleSubmitCancellation(booking.bookingReference, reason);
    });

    // Event listeners
    container.querySelector('#detail-modal-close')?.addEventListener('click', () => this.close());
    container.querySelector('#btn-close-detail')?.addEventListener('click', () => this.close());
  }

  /**
   * Handle Payment Initiation from detail modal
   * @param {object} booking
   * @param {string} provider
   */
  static async handleInitiatePayment(booking, provider = 'MOCK') {
    if (this.isPaying) return;
    this.isPaying = true;

    const payBtn = document.getElementById('btn-detail-pay');
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.innerHTML = `<span class="status-anim-spinner">🔄</span> Initializing secure payment...`;
    }

    try {
      const response = await api.initiatePayment({
        bookingReference: booking.bookingReference,
        provider,
      });

      const paymentData = response?.data || response;
      const statusContainer = document.getElementById('detail-payment-status-container');
      const checkoutPanel = document.getElementById('detail-payment-checkout');
      if (checkoutPanel) checkoutPanel.classList.add('hidden');

      if (statusContainer) {
        statusContainer.innerHTML = `
          <div class="payment-status-card payment-status-in-flight">
            <span class="status-anim-spinner" aria-hidden="true">🔄</span>
            <h4 style="margin: 0;">Payment Processing</h4>
            <p style="margin: 0; font-size: 0.88rem;">
              Communicating with ${escapeHtml(paymentData?.provider || 'Gateway')}... Verifying transaction.
            </p>
          </div>
        `;
      }

      this.startPaymentPolling(booking.bookingReference);
    } catch (err) {
      this.isPaying = false;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.innerHTML = `Pay & Confirm Booking &rarr;`;
      }
      this.showAlert(err.message || 'Payment initiation failed. Please try again.', 'warning');
    }
  }

  /**
   * Bounded payment polling in detail modal
   * @param {string} bookingReference
   */
  static startPaymentPolling(bookingReference) {
    this.clearIntervals();

    let attempts = 0;
    const maxAttempts = 15;

    const poll = async () => {
      attempts++;
      try {
        const [paymentRes, bookingRes] = await Promise.all([
          api.getPaymentStatus(bookingReference).catch(() => null),
          api.getBookingByReference(bookingReference).catch(() => null),
        ]);

        const payment = paymentRes?.data || paymentRes;
        const currentBooking = bookingRes?.data || bookingRes;

        if (payment?.status === 'SUCCESS' && currentBooking?.status === 'CONFIRMED') {
          this.clearIntervals();
          this.isPaying = false;
          this.open(bookingReference);
          return;
        }

        if (payment?.status === 'FAILED') {
          this.clearIntervals();
          this.isPaying = false;
          const statusContainer = document.getElementById('detail-payment-status-container');
          const checkoutPanel = document.getElementById('detail-payment-checkout');
          if (statusContainer) {
            statusContainer.innerHTML = `
              <div class="payment-status-card payment-status-failed">
                <div style="font-size: 2rem;">⚠️</div>
                <h4 style="margin: 0; color: #b91c1c;">Payment Failed</h4>
                <p style="margin: 0; font-size: 0.88rem;">
                  Payment transaction failed. Your reservation hold remains active until timer expires.
                </p>
                <button type="button" class="btn-secondary" id="btn-detail-retry-payment" style="margin-top: 0.5rem;">
                  🔄 Try Another Method
                </button>
              </div>
            `;
            statusContainer
              .querySelector('#btn-detail-retry-payment')
              ?.addEventListener('click', () => {
                statusContainer.innerHTML = '';
                if (checkoutPanel) checkoutPanel.classList.remove('hidden');
                const payBtn = document.getElementById('btn-detail-pay');
                if (payBtn) {
                  payBtn.disabled = false;
                  payBtn.innerHTML = `Pay & Confirm Booking &rarr;`;
                }
              });
          }
          return;
        }

        if (attempts >= maxAttempts) {
          this.clearIntervals();
          this.isPaying = false;
        }
      } catch {
        if (attempts >= maxAttempts) {
          this.clearIntervals();
          this.isPaying = false;
        }
      }
    };

    setTimeout(poll, 1500);
    this.paymentPollingInterval = setInterval(poll, 2000);
  }

  /**
   * Submit or prompt cancellation request
   * @param {string} bookingReference
   * @param {string|null} [explicitReason]
   */
  static async handleCancellation(bookingReference, explicitReason = null) {
    if (this.isCancelling) return;

    let reason = explicitReason;
    if (!reason && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      try {
        reason = window.prompt('Please provide a reason for cancellation:');
        if (reason === null) return; // user cancelled prompt
      } catch {
        reason = null;
      }
    }
    if (!reason) {
      reason = 'Customer requested cancellation';
    }

    this.isCancelling = true;

    const submitBtn = document.getElementById('btn-submit-cancellation-form');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="status-anim-spinner">🔄</span> Submitting Cancellation Request...`;
    }

    try {
      const res = await api.cancelBooking(bookingReference, reason);
      this.isCancelling = false;
      const updated = res?.data || res;
      if (updated && updated.status) {
        this.renderBooking(updated);
      } else {
        await this.open(bookingReference);
      }
      this.showAlert('Cancellation request submitted successfully.', 'success');
    } catch (err) {
      this.isCancelling = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Submit Cancellation Request`;
      }
      this.showAlert(err.message || 'Failed to submit cancellation request.', 'warning');
    }
  }

  /**
   * Submit cancellation request for administrative review
   * @param {string} bookingReference
   * @param {string} reason
   */
  static async handleSubmitCancellation(bookingReference, reason) {
    return this.handleCancellation(bookingReference, reason);
  }

  /**
   * Securely download document PDF via presigned URL
   * @param {string} bookingReference
   * @param {'invoice'|'voucher'} documentType
   * @param {HTMLButtonElement} btn
   */
  static async handleDownloadDocument(bookingReference, documentType, btn) {
    if (!bookingReference) return;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="status-anim-spinner">🔄</span> Opening...`;
    }

    try {
      let res;
      if (documentType === 'invoice') {
        res = await api.downloadInvoice(bookingReference);
      } else {
        res = await api.downloadVoucher(bookingReference);
      }

      const downloadUrl = res?.downloadUrl || res?.data?.downloadUrl;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Download URL not provided by server');
      }
    } catch (err) {
      this.showAlert(
        `Failed to download ${documentType}: ${err.message || 'Document is still generating'}`,
        'warning',
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  static showAlert(message, type = 'warning') {
    const alertBox = document.getElementById('detail-alert-box');
    if (!alertBox) return;

    alertBox.className = `party-alert-box party-alert-${type}`;
    alertBox.innerHTML = `<span>${escapeHtml(message)}</span>`;
    alertBox.classList.remove('hidden');
  }

  static close() {
    this.clearIntervals();
    const container = this.getContainer();
    if (container) {
      container.classList.add('hidden');
      container.innerHTML = '';
      document.body.style.overflow = '';
    }
  }
}
