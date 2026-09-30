import { api } from '../../api/client.js';
import { escapeHtml, formatPrice } from '../../utils/formatters.js';

/**
 * Admin Cancellation Review & Refund Operations Tab
 *
 * CRITICAL FROZEN STATE INVARIANT:
 * - PROCESSING refund ≠ REFUNDED payment ≠ CANCELLED booking
 * - While refund is PROCESSING, booking remains CONFIRMED and inventory remains reserved.
 * - Only upon definitive gateway settlement does payment transition to REFUNDED, booking to CANCELLED, and inventory released.
 */
export class AdminCancellationsTab {
  /**
   * Render Cancellation Queue Tab.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">Cancellation & Refund Operations</h2>
          <p class="admin-tab-subtitle">Review customer cancellation requests, evaluate DEC-007 policies, and authorize gateway refunds</p>
        </div>
      </div>

      <div class="admin-filter-bar">
        <div class="filter-group">
          <label for="admin-cancel-status-filter" class="filter-label">Request Status</label>
          <select id="admin-cancel-status-filter" class="filter-select">
            <option value="">All Requests</option>
            <option value="PENDING_APPROVAL" selected>Pending Review Only</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="SETTLED">Settled</option>
          </select>
        </div>
      </div>

      <div id="admin-cancellations-table-container" class="admin-table-container">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading cancellation review queue...</p>
        </div>
      </div>

      <!-- Authorize Action Modal -->
      <div id="admin-cancel-action-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Cancellation Decision"></div>
    `;

    const statusFilter = container.querySelector('#admin-cancel-status-filter');
    statusFilter?.addEventListener('change', () => this.loadCancellations(container));

    await this.loadCancellations(container);
  }

  static async loadCancellations(container) {
    const tableContainer = container.querySelector('#admin-cancellations-table-container');
    const statusFilter = container.querySelector('#admin-cancel-status-filter');
    if (!tableContainer) return;

    const status = statusFilter?.value || undefined;

    tableContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading cancellation review queue...</p>
      </div>
    `;

    try {
      const response = await api.getAdminCancellations({ limit: 50, status });
      const items = Array.isArray(response) ? response : response?.items || response?.data || [];

      if (!items || items.length === 0) {
        tableContainer.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">⚖️</div>
            <h3>No Cancellation Requests</h3>
            <p>No customer cancellation requests currently match the selected status.</p>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <table class="admin-table" aria-label="Cancellation review queue">
          <thead>
            <tr>
              <th>Booking Reference</th>
              <th>Customer Reason</th>
              <th>Calculated Refund</th>
              <th>Calculated Penalty</th>
              <th>Status</th>
              <th>Requested Date</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((req) => {
                const reqStatus = req.status || 'PENDING_APPROVAL';
                let badgeClass = 'badge-warning';
                if (reqStatus === 'APPROVED') badgeClass = 'badge-info';
                if (reqStatus === 'SETTLED') badgeClass = 'badge-success';
                if (reqStatus === 'REJECTED') badgeClass = 'badge-danger';

                const isPending = reqStatus === 'PENDING_APPROVAL';

                return `
                <tr data-cancel-id="${escapeHtml(req.id)}">
                  <td>
                    <code>${escapeHtml(req.bookingReference || req.bookingId)}</code>
                  </td>
                  <td>
                    <div class="table-primary-text truncate-text">${escapeHtml(req.cancellationReason)}</div>
                    ${req.adminNotes ? `<div class="table-secondary-text">Admin Note: ${escapeHtml(req.adminNotes)}</div>` : ''}
                  </td>
                  <td>
                    <strong style="color: #2ecc71;">${formatPrice(req.calculatedRefundAmount, 'INR')}</strong>
                  </td>
                  <td>
                    <span class="text-muted">${formatPrice(req.calculatedPenaltyAmount, 'INR')}</span>
                  </td>
                  <td>
                    <span class="badge ${badgeClass}">${escapeHtml(reqStatus)}</span>
                  </td>
                  <td>
                    <span class="text-muted">${req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '—'}</span>
                  </td>
                  <td class="text-right">
                    ${
                      isPending
                        ? `
                      <button type="button" class="btn-action btn-authorize-cancel" data-id="${escapeHtml(req.id)}" data-ref="${escapeHtml(req.bookingReference || '')}" data-refund="${req.calculatedRefundAmount}" title="Authorize Refund">✅ Authorize</button>
                      <button type="button" class="btn-action btn-danger btn-reject-cancel" data-id="${escapeHtml(req.id)}" data-ref="${escapeHtml(req.bookingReference || '')}" title="Reject Request">❌ Reject</button>
                    `
                        : `
                      <span class="text-muted">Decision Recorded</span>
                    `
                    }
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      `;

      tableContainer.querySelectorAll('.btn-authorize-cancel').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const ref = btn.getAttribute('data-ref');
          const refundAmount = parseInt(btn.getAttribute('data-refund'), 10) || 0;
          this.openDecisionModal(container, id, ref, refundAmount, 'AUTHORIZE');
        });
      });

      tableContainer.querySelectorAll('.btn-reject-cancel').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const ref = btn.getAttribute('data-ref');
          this.openDecisionModal(container, id, ref, 0, 'REJECT');
        });
      });
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load cancellation requests</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading queue.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-cancel-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = tableContainer.querySelector('#admin-cancel-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadCancellations(container));
      }
    }
  }

  /**
   * Open Decision Modal for Authorize or Reject.
   */
  static openDecisionModal(container, cancellationId, bookingRef, defaultRefundMinor, actionType) {
    const modal = container.querySelector('#admin-cancel-action-modal');
    if (!modal) return;

    const isAuthorize = actionType === 'AUTHORIZE';
    const defaultRefundRupees = defaultRefundMinor ? defaultRefundMinor / 100 : 0;

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog">
        <div class="modal-header">
          <h3>${isAuthorize ? 'Authorize Cancellation & Refund' : 'Reject Cancellation Request'}</h3>
          <button type="button" class="btn-close-modal" id="admin-decision-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <form id="admin-decision-form" class="admin-modal-form">
          <div id="admin-decision-form-error" class="form-error-banner hidden" role="alert"></div>

          <p class="modal-info-text">
            ${
              isAuthorize
                ? `Authorizing this request will submit a gateway refund of <strong>${formatPrice(defaultRefundMinor, 'INR')}</strong> for booking <code>${escapeHtml(bookingRef)}</code>. Upon gateway settlement, the booking is cancelled and seat capacity is released.`
                : `Rejecting this request will keep the reservation for booking <code>${escapeHtml(bookingRef)}</code> intact without processing a refund.`
            }
          </p>

          ${
            isAuthorize
              ? `
            <div class="form-group">
              <label for="override-refund-amount">Refund Amount Override (₹ optional)</label>
              <input type="number" id="override-refund-amount" class="form-input" min="0" step="1" value="${defaultRefundRupees}" placeholder="Calculated amount: ${defaultRefundRupees}" />
            </div>
          `
              : ''
          }

          <div class="form-group">
            <label for="admin-decision-notes">Administrative Notes ${isAuthorize ? '(Optional)' : '(Required)'}</label>
            <textarea id="admin-decision-notes" class="form-textarea" rows="3" ${!isAuthorize ? 'required' : ''} placeholder="${isAuthorize ? 'Add notes regarding refund justification...' : 'Provide specific rejection rationale...'}"></textarea>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="admin-decision-cancel">Cancel</button>
            <button type="submit" class="btn-${isAuthorize ? 'primary' : 'danger'}" id="admin-decision-submit">
              ${isAuthorize ? 'Confirm Authorization' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </div>
    `;

    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    };

    modal.querySelector('#admin-decision-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#admin-decision-cancel')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#admin-decision-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBanner = modal.querySelector('#admin-decision-form-error');
      const submitBtn = modal.querySelector('#admin-decision-submit');

      const adminNotes = modal.querySelector('#admin-decision-notes')?.value.trim() || undefined;

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
        errorBanner.classList.add('hidden');

        if (isAuthorize) {
          const overrideInput = modal.querySelector('#override-refund-amount')?.value;
          const overrideRefundAmount =
            overrideInput !== '' && !isNaN(Number(overrideInput))
              ? Math.round(Number(overrideInput) * 100)
              : undefined;

          await api.authorizeAdminCancellation(cancellationId, {
            adminNotes,
            overrideRefundAmount,
          });
        } else {
          await api.rejectAdminCancellation(cancellationId, {
            adminNotes,
          });
        }

        closeModal();
        await this.loadCancellations(container);
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to process cancellation decision.';
        errorBanner.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isAuthorize ? 'Confirm Authorization' : 'Confirm Rejection';
      }
    });
  }
}
