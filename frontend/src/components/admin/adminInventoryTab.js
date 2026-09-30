import { api } from '../../api/client.js';
import { escapeHtml, formatPrice } from '../../utils/formatters.js';

/**
 * Admin Departures & Inventory Scheduling Tab
 */
export class AdminInventoryTab {
  /**
   * Render Departures Tab.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">Departure & Capacity Management</h2>
          <p class="admin-tab-subtitle">Schedule tour departure batches, manage seat inventory, and inspect passenger manifests</p>
        </div>
        <div class="admin-tab-actions">
          <button type="button" class="btn-primary btn-sm" id="admin-create-departure-btn">
            + Schedule Departure
          </button>
        </div>
      </div>

      <div class="admin-filter-bar">
        <div class="filter-group filter-large">
          <label for="admin-departure-package-select" class="filter-label">Filter by Package</label>
          <select id="admin-departure-package-select" class="filter-select">
            <option value="">Loading Packages...</option>
          </select>
        </div>
      </div>

      <div id="admin-departures-table-container" class="admin-table-container">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading departure schedules...</p>
        </div>
      </div>

      <!-- Departure Schedule Modal -->
      <div id="admin-departure-form-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Departure Editor"></div>

      <!-- Manifest Modal -->
      <div id="admin-manifest-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Passenger Manifest"></div>
    `;

    await this.initPackageSelector(container);

    const createBtn = container.querySelector('#admin-create-departure-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const pkgSelect = container.querySelector('#admin-departure-package-select');
        const selectedPackageId = pkgSelect?.value;
        this.openDepartureModal(container, selectedPackageId, null);
      });
    }

    const pkgSelect = container.querySelector('#admin-departure-package-select');
    if (pkgSelect) {
      pkgSelect.addEventListener('change', () => this.loadDepartures(container));
    }
  }

  static async initPackageSelector(container) {
    const pkgSelect = container.querySelector('#admin-departure-package-select');
    if (!pkgSelect) return;

    try {
      const res = await api.getAdminPackages({ limit: 100 });
      const packages = Array.isArray(res) ? res : res?.items || res?.data || [];

      if (packages.length === 0) {
        pkgSelect.innerHTML = '<option value="">No packages available</option>';
        return;
      }

      pkgSelect.innerHTML = `
        <option value="">All Packages</option>
        ${packages
          .map(
            (p) => `
          <option value="${escapeHtml(p.id)}">${escapeHtml(p.title)} (${escapeHtml(p.destinationCity || '')})</option>
        `,
          )
          .join('')}
      `;

      await this.loadDepartures(container);
    } catch (err) {
      pkgSelect.innerHTML = '<option value="">Failed to load packages</option>';
    }
  }

  static async loadDepartures(container) {
    const tableContainer = container.querySelector('#admin-departures-table-container');
    const pkgSelect = container.querySelector('#admin-departure-package-select');
    if (!tableContainer) return;

    const selectedPackageId = pkgSelect?.value;

    tableContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading departure schedules...</p>
      </div>
    `;

    try {
      let departures = [];
      if (selectedPackageId) {
        const res = await api.getAdminPackageDepartures(selectedPackageId);
        departures = Array.isArray(res) ? res : res?.items || res?.data || [];
      } else {
        // Fetch departures for all packages
        const pkgRes = await api.getAdminPackages({ limit: 50 });
        const pkgs = Array.isArray(pkgRes) ? pkgRes : pkgRes?.items || pkgRes?.data || [];
        const allDepsPromises = pkgs.map((p) =>
          api.getAdminPackageDepartures(p.id).catch(() => []),
        );
        const results = await Promise.all(allDepsPromises);
        departures = results.flatMap((r) => (Array.isArray(r) ? r : r?.items || r?.data || []));
      }

      if (!departures || departures.length === 0) {
        tableContainer.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">🗓️</div>
            <h3>No Scheduled Departures Found</h3>
            <p>Schedule a departure batch for a tour package to open bookings for travellers.</p>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <table class="admin-table" aria-label="Departures list">
          <thead>
            <tr>
              <th>Departure Dates</th>
              <th>Seat Capacity</th>
              <th>Available Seats</th>
              <th>Status</th>
              <th>Price Override</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${departures
              .map((dep) => {
                const totalCap = dep.totalSeatCapacity ?? 0;
                const booked = dep.bookedSeats ?? 0;
                const available = Math.max(0, totalCap - booked);
                const status = dep.status || 'OPEN';

                let statusBadgeClass = 'badge-success';
                if (status === 'CLOSED') statusBadgeClass = 'badge-secondary';
                if (status === 'CANCELLED') statusBadgeClass = 'badge-danger';
                if (status === 'COMPLETED') statusBadgeClass = 'badge-info';

                return `
                <tr data-departure-id="${escapeHtml(dep.id)}">
                  <td>
                    <div class="table-primary-text">📅 ${escapeHtml(dep.departureDate)}</div>
                    <div class="table-secondary-text">Return: ${escapeHtml(dep.returnDate)}</div>
                  </td>
                  <td>
                    <strong>${totalCap} seats</strong>
                    <div class="table-secondary-text">${booked} booked</div>
                  </td>
                  <td>
                    <span class="badge ${available > 0 ? 'badge-success' : 'badge-danger'}">
                      ${available} seats left
                    </span>
                  </td>
                  <td>
                    <span class="badge ${statusBadgeClass}">${escapeHtml(status)}</span>
                  </td>
                  <td>
                    ${
                      dep.priceOverrideAdult
                        ? `<div>Adult: ${formatPrice(dep.priceOverrideAdult, dep.currency || 'INR')}</div>`
                        : '<span class="text-muted">Standard</span>'
                    }
                  </td>
                  <td class="text-right">
                    <button type="button" class="btn-action btn-view-manifest" data-id="${escapeHtml(dep.id)}" title="Passenger Manifest">📋 Manifest</button>
                    <button type="button" class="btn-action btn-edit-departure" data-id="${escapeHtml(dep.id)}" data-pkg-id="${escapeHtml(dep.packageId)}" title="Edit Departure">✏️ Edit</button>
                    <button type="button" class="btn-action btn-danger btn-delete-departure" data-id="${escapeHtml(dep.id)}" title="Delete Departure">🗑️ Delete</button>
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      `;

      tableContainer.querySelectorAll('.btn-view-manifest').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openManifestModal(container, id);
        });
      });

      tableContainer.querySelectorAll('.btn-edit-departure').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const pkgId = btn.getAttribute('data-pkg-id');
          try {
            const dep = await api.getAdminDepartureById(id);
            this.openDepartureModal(container, pkgId, dep);
          } catch (err) {
            alert(`Error loading departure: ${err.message}`);
          }
        });
      });

      tableContainer.querySelectorAll('.btn-delete-departure').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this departure schedule?')) {
            try {
              await api.deleteAdminDeparture(id);
              await this.loadDepartures(container);
            } catch (err) {
              alert(`Failed to delete departure: ${err.message}`);
            }
          }
        });
      });
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load departures</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading departures.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-departures-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = tableContainer.querySelector('#admin-departures-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadDepartures(container));
      }
    }
  }

  /**
   * Open Departure Schedule Modal.
   */
  static async openDepartureModal(container, defaultPackageId, departure = null) {
    const modal = container.querySelector('#admin-departure-form-modal');
    if (!modal) return;

    const isEdit = Boolean(departure?.id);

    // Fetch packages for dropdown if creating
    let packages = [];
    try {
      const res = await api.getAdminPackages({ limit: 100 });
      packages = Array.isArray(res) ? res : res?.items || res?.data || [];
    } catch {
      // Fallback
    }

    const selectedPkgId = departure?.packageId || defaultPackageId || (packages[0]?.id ?? '');

    const adultOverrideINR = departure?.priceOverrideAdult
      ? Number(departure.priceOverrideAdult) / 100
      : '';
    const childOverrideINR = departure?.priceOverrideChild
      ? Number(departure.priceOverrideChild) / 100
      : '';

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Departure Schedule' : 'Schedule New Departure'}</h3>
          <button type="button" class="btn-close-modal" id="admin-dep-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <form id="admin-dep-form" class="admin-modal-form">
          <div id="admin-dep-form-error" class="form-error-banner hidden" role="alert"></div>

          ${
            !isEdit
              ? `
            <div class="form-group">
              <label for="dep-pkg-select">Tour Package *</label>
              <select id="dep-pkg-select" class="form-select" required>
                ${packages
                  .map(
                    (p) => `
                  <option value="${escapeHtml(p.id)}" ${p.id === selectedPkgId ? 'selected' : ''}>
                    ${escapeHtml(p.title)}
                  </option>
                `,
                  )
                  .join('')}
              </select>
            </div>
          `
              : ''
          }

          <div class="form-row">
            <div class="form-group col-half">
              <label for="dep-start-date">Departure Date * (YYYY-MM-DD)</label>
              <input type="date" id="dep-start-date" class="form-input" required value="${escapeHtml(departure?.departureDate || '')}" />
            </div>
            <div class="form-group col-half">
              <label for="dep-return-date">Return Date * (YYYY-MM-DD)</label>
              <input type="date" id="dep-return-date" class="form-input" required value="${escapeHtml(departure?.returnDate || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="dep-capacity">Total Seat Capacity *</label>
              <input type="number" id="dep-capacity" class="form-input" required min="1" step="1" placeholder="e.g. 25" value="${departure?.totalSeatCapacity ?? 20}" />
            </div>
            <div class="form-group col-half">
              <label for="dep-status">Departure Status</label>
              <select id="dep-status" class="form-select">
                <option value="OPEN" ${departure?.status === 'OPEN' || !departure ? 'selected' : ''}>OPEN</option>
                <option value="CLOSED" ${departure?.status === 'CLOSED' ? 'selected' : ''}>CLOSED</option>
                <option value="CANCELLED" ${departure?.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                <option value="COMPLETED" ${departure?.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="dep-price-adult">Adult Price Override (₹ optional)</label>
              <input type="number" id="dep-price-adult" class="form-input" min="0" step="1" placeholder="Leave empty for standard price" value="${adultOverrideINR}" />
            </div>
            <div class="form-group col-half">
              <label for="dep-price-child">Child Price Override (₹ optional)</label>
              <input type="number" id="dep-price-child" class="form-input" min="0" step="1" placeholder="Leave empty for standard price" value="${childOverrideINR}" />
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="admin-dep-form-cancel">Cancel</button>
            <button type="submit" class="btn-primary" id="admin-dep-form-submit">
              ${isEdit ? 'Save Changes' : 'Schedule Departure'}
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

    modal.querySelector('#admin-dep-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#admin-dep-form-cancel')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#admin-dep-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBanner = modal.querySelector('#admin-dep-form-error');
      const submitBtn = modal.querySelector('#admin-dep-form-submit');

      const pkgId = isEdit ? departure.packageId : modal.querySelector('#dep-pkg-select')?.value;
      const departureDate = modal.querySelector('#dep-start-date')?.value;
      const returnDate = modal.querySelector('#dep-return-date')?.value;
      const totalSeatCapacity = parseInt(modal.querySelector('#dep-capacity')?.value, 10);
      const status = modal.querySelector('#dep-status')?.value || 'OPEN';

      const adultPriceRupees = modal.querySelector('#dep-price-adult')?.value;
      const childPriceRupees = modal.querySelector('#dep-price-child')?.value;

      if (!pkgId) {
        errorBanner.textContent = 'Package is required.';
        errorBanner.classList.remove('hidden');
        return;
      }
      if (!departureDate || !returnDate) {
        errorBanner.textContent = 'Departure and return dates are required.';
        errorBanner.classList.remove('hidden');
        return;
      }
      if (returnDate < departureDate) {
        errorBanner.textContent = 'Return date must be on or after departure date.';
        errorBanner.classList.remove('hidden');
        return;
      }
      if (!totalSeatCapacity || totalSeatCapacity <= 0) {
        errorBanner.textContent = 'Seat capacity must be greater than 0.';
        errorBanner.classList.remove('hidden');
        return;
      }

      const priceOverrideAdult =
        adultPriceRupees !== '' && !isNaN(Number(adultPriceRupees))
          ? Math.round(Number(adultPriceRupees) * 100)
          : null;
      const priceOverrideChild =
        childPriceRupees !== '' && !isNaN(Number(childPriceRupees))
          ? Math.round(Number(childPriceRupees) * 100)
          : null;

      const payload = {
        departureDate,
        returnDate,
        totalSeatCapacity,
        status,
        priceOverrideAdult,
        priceOverrideChild,
        currency: 'INR',
      };

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        errorBanner.classList.add('hidden');

        if (isEdit) {
          await api.updateAdminDeparture(departure.id, payload);
        } else {
          await api.createAdminDeparture(pkgId, { ...payload, packageId: pkgId });
        }

        closeModal();
        await this.loadDepartures(container);
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to save departure.';
        errorBanner.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Schedule Departure';
      }
    });
  }

  /**
   * Open Departure Passenger Manifest Modal.
   */
  static async openManifestModal(container, departureId) {
    const modal = container.querySelector('#admin-manifest-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog admin-modal-large">
        <div class="modal-header">
          <h3>Confirmed Passenger Manifest</h3>
          <button type="button" class="btn-close-modal" id="admin-manifest-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <div id="admin-manifest-modal-content" class="modal-body">
          <div class="admin-loading-state">
            <div class="spinner"></div>
            <p>Loading confirmed passenger manifest...</p>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    };

    modal.querySelector('#admin-manifest-modal-close')?.addEventListener('click', closeModal);

    const content = modal.querySelector('#admin-manifest-modal-content');
    try {
      const manifest = await api.getAdminDepartureManifest(departureId);
      const passengers = Array.isArray(manifest)
        ? manifest
        : manifest?.passengers || manifest?.data || [];

      if (!passengers || passengers.length === 0) {
        content.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">👥</div>
            <h3>No Confirmed Passengers</h3>
            <p>No confirmed bookings exist for this departure batch yet.</p>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="manifest-summary-banner">
          <div><strong>Total Confirmed Passengers:</strong> ${passengers.length}</div>
        </div>
        <table class="admin-table" aria-label="Passenger manifest">
          <thead>
            <tr>
              <th>#</th>
              <th>Passenger Name</th>
              <th>Type & Age</th>
              <th>Gender</th>
              <th>Booking Ref & Contact</th>
              <th>Special Requests</th>
            </tr>
          </thead>
          <tbody>
            ${passengers
              .map(
                (p, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>
                  <strong>${escapeHtml(p.fullName || p.name || '—')}</strong>
                  ${p.isPrimaryContact ? '<span class="badge badge-info">Primary</span>' : ''}
                </td>
                <td>${escapeHtml(p.passengerType || 'ADULT')} · ${p.ageAtBooking ?? '—'} yrs</td>
                <td>${escapeHtml(p.gender || '—')}</td>
                <td>
                  <code>${escapeHtml(p.bookingReference || '—')}</code>
                  ${p.customerEmail ? `<div class="table-secondary-text">${escapeHtml(p.customerName || '')} &lt;${escapeHtml(p.customerEmail)}&gt;</div>` : ''}
                </td>
                <td><span class="table-secondary-text">${escapeHtml(p.specialRequests || 'None')}</span></td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      content.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load passenger manifest</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading manifest.')}</p>
        </div>
      `;
    }
  }
}
