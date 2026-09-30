import { api } from '../../api/client.js';
import { escapeHtml, formatPrice } from '../../utils/formatters.js';

/**
 * Admin Bookings Operations Tab
 */
export class AdminBookingsTab {
  /**
   * Render Bookings Tab.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">Booking Operations</h2>
          <p class="admin-tab-subtitle">Inspect customer reservations, review passenger details, and track booking states</p>
        </div>
      </div>

      <div class="admin-filter-bar">
        <div class="filter-group">
          <label for="admin-booking-status-filter" class="filter-label">Booking Status</label>
          <select id="admin-booking-status-filter" class="filter-select">
            <option value="">All Statuses</option>
            <option value="AWAITING_PAYMENT">Awaiting Payment</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <div class="filter-group filter-large">
          <label for="admin-booking-search-input" class="filter-label">Search Bookings</label>
          <input type="text" id="admin-booking-search-input" class="filter-input" placeholder="Search by booking reference or customer email..." />
        </div>
      </div>

      <div id="admin-bookings-table-container" class="admin-table-container">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading bookings...</p>
        </div>
      </div>

      <!-- Booking Inspection Modal -->
      <div id="admin-booking-detail-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Booking Details"></div>
    `;

    const statusFilter = container.querySelector('#admin-booking-status-filter');
    const searchInput = container.querySelector('#admin-booking-search-input');

    statusFilter?.addEventListener('change', () => this.loadBookings(container));

    let searchTimer = null;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.loadBookings(container), 300);
    });

    await this.loadBookings(container);
  }

  static async loadBookings(container) {
    const tableContainer = container.querySelector('#admin-bookings-table-container');
    const statusFilter = container.querySelector('#admin-booking-status-filter');
    const searchInput = container.querySelector('#admin-booking-search-input');
    if (!tableContainer) return;

    const status = statusFilter?.value || undefined;
    const search = searchInput?.value.trim() || undefined;

    tableContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading bookings...</p>
      </div>
    `;

    try {
      const response = await api.getAdminBookings({ limit: 50, status, search });
      const items = Array.isArray(response) ? response : response?.items || response?.data || [];

      if (!items || items.length === 0) {
        tableContainer.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">📑</div>
            <h3>No Bookings Found</h3>
            <p>No customer reservations match the current filter or search criteria.</p>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <table class="admin-table" aria-label="Bookings list">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer Contact</th>
              <th>Package & Departure</th>
              <th>Party Size</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((b) => {
                const status = b.status || 'AWAITING_PAYMENT';
                let statusBadge = 'badge-warning';
                if (status === 'CONFIRMED') statusBadge = 'badge-success';
                if (status === 'CANCELLED') statusBadge = 'badge-danger';
                if (status === 'EXPIRED') statusBadge = 'badge-secondary';

                const primaryContact = b.primaryContact || {};
                const pkgTitle = b.packageSnapshot?.title || 'Tour Package';
                const depDate = b.departureSnapshot?.departureDate || '—';

                return `
                <tr data-booking-ref="${escapeHtml(b.bookingReference)}">
                  <td>
                    <code>${escapeHtml(b.bookingReference)}</code>
                    <div class="table-secondary-text">${b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}</div>
                  </td>
                  <td>
                    <div class="table-primary-text">${escapeHtml(primaryContact.name || 'Customer')}</div>
                    <div class="table-secondary-text">${escapeHtml(primaryContact.email || '—')}</div>
                    <div class="table-secondary-text">${escapeHtml(primaryContact.phone || '')}</div>
                  </td>
                  <td>
                    <div class="table-primary-text">${escapeHtml(pkgTitle)}</div>
                    <div class="table-secondary-text">Departure: 📅 ${escapeHtml(depDate)}</div>
                  </td>
                  <td>
                    <strong>${b.partySize || (b.adultCount || 0) + (b.childCount || 0)} Guests</strong>
                    <div class="table-secondary-text">${b.adultCount || 0} adults · ${b.childCount || 0} children</div>
                  </td>
                  <td>
                    <strong>${formatPrice(b.totalPrice, b.currency || 'INR')}</strong>
                  </td>
                  <td>
                    <span class="badge ${statusBadge}">${escapeHtml(status)}</span>
                  </td>
                  <td class="text-right">
                    <button type="button" class="btn-action btn-inspect-booking" data-ref="${escapeHtml(b.bookingReference)}" title="View Booking Details">👁️ Details</button>
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      `;

      tableContainer.querySelectorAll('.btn-inspect-booking').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ref = btn.getAttribute('data-ref');
          try {
            const booking = await api.getAdminBookingByReference(ref);
            this.openBookingModal(container, booking);
          } catch (err) {
            alert(`Error loading booking: ${err.message}`);
          }
        });
      });
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load bookings</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading bookings.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-bookings-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = tableContainer.querySelector('#admin-bookings-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadBookings(container));
      }
    }
  }

  /**
   * Open Booking Detail Modal.
   */
  static openBookingModal(container, booking) {
    const modal = container.querySelector('#admin-booking-detail-modal');
    if (!modal) return;

    const contact = booking.primaryContact || {};
    const pkg = booking.packageSnapshot || {};
    const dep = booking.departureSnapshot || {};
    const breakdown = booking.priceBreakdown || {};
    const passengers = Array.isArray(booking.passengers) ? booking.passengers : [];

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog admin-modal-large">
        <div class="modal-header">
          <h3>Booking ${escapeHtml(booking.bookingReference)}</h3>
          <button type="button" class="btn-close-modal" id="admin-bkg-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <div class="modal-body">
          <div class="booking-detail-grid">
            <div class="detail-card">
              <h4>Reservation Status</h4>
              <p><strong>Status:</strong> <span class="badge badge-info">${escapeHtml(booking.status)}</span></p>
              <p><strong>Total Price:</strong> ${formatPrice(booking.totalPrice, booking.currency || 'INR')}</p>
              <p><strong>Created:</strong> ${booking.createdAt ? new Date(booking.createdAt).toLocaleString() : '—'}</p>
              <p><strong>Expires:</strong> ${booking.expiresAt ? new Date(booking.expiresAt).toLocaleString() : 'N/A'}</p>
            </div>

            <div class="detail-card">
              <h4>Customer Primary Contact</h4>
              <p><strong>Name:</strong> ${escapeHtml(contact.name || '—')}</p>
              <p><strong>Email:</strong> ${escapeHtml(contact.email || '—')}</p>
              <p><strong>Phone:</strong> ${escapeHtml(contact.phone || '—')}</p>
            </div>

            <div class="detail-card col-span-2">
              <h4>Tour & Schedule</h4>
              <p><strong>Package:</strong> ${escapeHtml(pkg.title || 'Tour Package')}</p>
              <p><strong>Route:</strong> ${escapeHtml(pkg.originCity || '—')} → ${escapeHtml(pkg.destinationCity || '—')}</p>
              <p><strong>Departure Date:</strong> ${escapeHtml(dep.departureDate || '—')} · <strong>Return Date:</strong> ${escapeHtml(dep.returnDate || '—')}</p>
            </div>
          </div>

          <h4 class="section-subtitle">Passenger Manifest</h4>
          <table class="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Full Name</th>
                <th>Type</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              ${passengers
                .map(
                  (p, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${escapeHtml(p.fullName || '—')}</strong></td>
                  <td>${escapeHtml(p.passengerType || 'ADULT')}</td>
                  <td>${p.ageAtBooking ?? '—'} yrs</td>
                  <td>${escapeHtml(p.gender || '—')}</td>
                  <td>${p.isPrimaryContact ? '<span class="badge badge-info">Primary Contact</span>' : 'Passenger'}</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    };

    modal.querySelector('#admin-bkg-modal-close')?.addEventListener('click', closeModal);
  }
}
