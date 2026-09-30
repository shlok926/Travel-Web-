import { api } from '../../api/client.js';
import { escapeHtml, formatPrice, formatDuration } from '../../utils/formatters.js';

/**
 * Admin Tour Package Management Tab
 */
export class AdminPackagesTab {
  /**
   * Render Packages Tab.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">Tour Package Management</h2>
          <p class="admin-tab-subtitle">Create, configure, publish, and manage itineraries for tour packages</p>
        </div>
        <div class="admin-tab-actions">
          <button type="button" class="btn-primary btn-sm" id="admin-create-package-btn">
            + New Tour Package
          </button>
        </div>
      </div>

      <div class="admin-filter-bar">
        <div class="filter-group">
          <label for="admin-package-status-filter" class="filter-label">Status</label>
          <select id="admin-package-status-filter" class="filter-select">
            <option value="">All Packages</option>
            <option value="true">Published Only</option>
            <option value="false">Draft Only</option>
          </select>
        </div>
      </div>

      <div id="admin-packages-table-container" class="admin-table-container">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading tour packages...</p>
        </div>
      </div>

      <!-- Package Editor Modal -->
      <div id="admin-package-form-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Tour Package Editor"></div>

      <!-- Itinerary Editor Modal -->
      <div id="admin-itinerary-form-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Itinerary Builder"></div>
    `;

    const createBtn = container.querySelector('#admin-create-package-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.openPackageModal(container, null));
    }

    const filterSelect = container.querySelector('#admin-package-status-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => this.loadPackages(container));
    }

    await this.loadPackages(container);
  }

  static async loadPackages(container) {
    const tableContainer = container.querySelector('#admin-packages-table-container');
    if (!tableContainer) return;

    const filterSelect = container.querySelector('#admin-package-status-filter');
    const isPublished = filterSelect?.value || undefined;

    tableContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading tour packages...</p>
      </div>
    `;

    try {
      const response = await api.getAdminPackages({ limit: 50, isPublished });
      const items = Array.isArray(response) ? response : response?.items || response?.data || [];

      if (!items || items.length === 0) {
        tableContainer.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">📦</div>
            <h3>No Tour Packages Found</h3>
            <p>Create your first tour package to offer travel experiences to your customers.</p>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <table class="admin-table" aria-label="Tour packages list">
          <thead>
            <tr>
              <th>Tour Package</th>
              <th>Route & Duration</th>
              <th>Base Adult Price</th>
              <th>Status</th>
              <th>Completeness</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((pkg) => {
                const isPub = Boolean(pkg.isPublished);
                const hasItinerary = Array.isArray(pkg.itinerary) && pkg.itinerary.length > 0;
                return `
                <tr data-package-id="${escapeHtml(pkg.id)}">
                  <td>
                    <div class="table-primary-text">${escapeHtml(pkg.title)}</div>
                    <div class="table-secondary-text"><code>/${escapeHtml(pkg.slug)}</code></div>
                  </td>
                  <td>
                    <div>${escapeHtml(pkg.originCity || 'Origin')} → ${escapeHtml(pkg.destinationCity || 'Destination')}</div>
                    <div class="table-secondary-text">${formatDuration(pkg.durationDays, pkg.durationNights)}</div>
                  </td>
                  <td>
                    <strong>${formatPrice(pkg.baseAdultPrice, pkg.currency || 'INR')}</strong>
                  </td>
                  <td>
                    <span class="badge ${isPub ? 'badge-success' : 'badge-warning'}">
                      ${isPub ? 'Published' : 'Draft'}
                    </span>
                    ${pkg.isFeatured ? '<span class="badge badge-featured">★ Featured</span>' : ''}
                  </td>
                  <td>
                    <span class="badge ${hasItinerary ? 'badge-info' : 'badge-secondary'}">
                      ${hasItinerary ? `${pkg.itinerary.length} Days Itinerary` : 'No Itinerary'}
                    </span>
                  </td>
                  <td class="text-right">
                    <button type="button" class="btn-action btn-edit-itinerary" data-id="${escapeHtml(pkg.id)}" title="Edit Itinerary">🗺️ Itinerary</button>
                    <button type="button" class="btn-action btn-edit-pkg" data-id="${escapeHtml(pkg.id)}" title="Edit Package">✏️ Edit</button>
                    <button type="button" class="btn-action ${isPub ? 'btn-unpublish-pkg' : 'btn-publish-pkg'}" data-id="${escapeHtml(pkg.id)}" title="${isPub ? 'Unpublish' : 'Publish'}">
                      ${isPub ? '⏸️ Unpublish' : '🚀 Publish'}
                    </button>
                    <button type="button" class="btn-action btn-danger btn-delete-pkg" data-id="${escapeHtml(pkg.id)}" data-title="${escapeHtml(pkg.title)}" title="Delete Package">🗑️ Delete</button>
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      `;

      // Attach button actions
      tableContainer.querySelectorAll('.btn-edit-pkg').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            const pkg = await api.getAdminPackageById(id);
            this.openPackageModal(container, pkg);
          } catch (err) {
            alert(`Error loading package: ${err.message}`);
          }
        });
      });

      tableContainer.querySelectorAll('.btn-edit-itinerary').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            const pkg = await api.getAdminPackageById(id);
            this.openItineraryModal(container, pkg);
          } catch (err) {
            alert(`Error loading package itinerary: ${err.message}`);
          }
        });
      });

      tableContainer.querySelectorAll('.btn-publish-pkg').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            await api.publishAdminPackage(id);
            await this.loadPackages(container);
          } catch (err) {
            alert(`Failed to publish package: ${err.message}`);
          }
        });
      });

      tableContainer.querySelectorAll('.btn-unpublish-pkg').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            await api.unpublishAdminPackage(id);
            await this.loadPackages(container);
          } catch (err) {
            alert(`Failed to unpublish package: ${err.message}`);
          }
        });
      });

      tableContainer.querySelectorAll('.btn-delete-pkg').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const title = btn.getAttribute('data-title');
          if (confirm(`Are you sure you want to delete the tour package "${title}"?`)) {
            try {
              await api.deleteAdminPackage(id);
              await this.loadPackages(container);
            } catch (err) {
              alert(`Failed to delete package: ${err.message}`);
            }
          }
        });
      });
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load tour packages</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading packages.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-packages-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = tableContainer.querySelector('#admin-packages-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadPackages(container));
      }
    }
  }

  /**
   * Open Package Form Modal.
   */
  static async openPackageModal(container, pkg = null) {
    const modal = container.querySelector('#admin-package-form-modal');
    if (!modal) return;

    const isEdit = Boolean(pkg?.id);

    // Fetch destinations and themes for selects
    let destinations = [];
    let themes = [];
    try {
      const destRes = await api.getAdminDestinations({ limit: 100 });
      destinations = Array.isArray(destRes) ? destRes : destRes?.items || destRes?.data || [];
      const themeRes = await api.getAdminThemes();
      themes = Array.isArray(themeRes) ? themeRes : themeRes?.items || themeRes?.data || [];
    } catch (err) {
      // Fallback
    }

    const currentBasePriceINR = pkg?.baseAdultPrice ? Number(pkg.baseAdultPrice) / 100 : 0;
    const currentChildPriceINR = pkg?.baseChildPrice ? Number(pkg.baseChildPrice) / 100 : 0;

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog admin-modal-large">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Tour Package' : 'Create New Tour Package'}</h3>
          <button type="button" class="btn-close-modal" id="admin-pkg-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <form id="admin-pkg-form" class="admin-modal-form">
          <div id="admin-pkg-form-error" class="form-error-banner hidden" role="alert"></div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="pkg-destination">Destination *</label>
              <select id="pkg-destination" class="form-select" required>
                <option value="">Select Destination</option>
                ${destinations
                  .map(
                    (d) => `
                  <option value="${escapeHtml(d.id)}" ${pkg?.destinationId === d.id ? 'selected' : ''}>
                    ${escapeHtml(d.cityName)}, ${escapeHtml(d.country)}
                  </option>
                `,
                  )
                  .join('')}
              </select>
            </div>
            <div class="form-group col-half">
              <label for="pkg-theme">Tour Theme</label>
              <select id="pkg-theme" class="form-select">
                <option value="">No Specific Theme</option>
                ${themes
                  .map(
                    (t) => `
                  <option value="${escapeHtml(t.id)}" ${pkg?.themeId === t.id ? 'selected' : ''}>
                    ${escapeHtml(t.title)}
                  </option>
                `,
                  )
                  .join('')}
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="pkg-title">Package Title *</label>
              <input type="text" id="pkg-title" class="form-input" required minlength="3" maxlength="255" placeholder="e.g. Kashmir 6D/5N Royal Retreat" value="${escapeHtml(pkg?.title || '')}" />
            </div>
            <div class="form-group col-half">
              <label for="pkg-slug">URL Slug * (lowercase, alphanumeric, hyphens)</label>
              <input type="text" id="pkg-slug" class="form-input" required minlength="2" maxlength="150" placeholder="e.g. kashmir-royal-retreat" value="${escapeHtml(pkg?.slug || '')}" />
            </div>
          </div>

          <div class="form-group">
            <label for="pkg-short-desc">Short Description * (10-500 chars)</label>
            <input type="text" id="pkg-short-desc" class="form-input" required minlength="10" maxlength="500" placeholder="Crisp highlights shown on package cards" value="${escapeHtml(pkg?.shortDescription || '')}" />
          </div>

          <div class="form-group">
            <label for="pkg-desc">Detailed Description * (min 10 chars)</label>
            <textarea id="pkg-desc" class="form-textarea" rows="4" required minlength="10" placeholder="Full comprehensive tour package details">${escapeHtml(pkg?.description || '')}</textarea>
          </div>

          <div class="form-row">
            <div class="form-group col-quarter">
              <label for="pkg-duration-days">Duration Days *</label>
              <input type="number" id="pkg-duration-days" class="form-input" required min="1" step="1" value="${pkg?.durationDays ?? 5}" />
            </div>
            <div class="form-group col-quarter">
              <label for="pkg-duration-nights">Duration Nights *</label>
              <input type="number" id="pkg-duration-nights" class="form-input" required min="0" step="1" value="${pkg?.durationNights ?? 4}" />
            </div>
            <div class="form-group col-quarter">
              <label for="pkg-origin">Origin City *</label>
              <input type="text" id="pkg-origin" class="form-input" required maxlength="100" placeholder="e.g. Srinagar" value="${escapeHtml(pkg?.originCity || '')}" />
            </div>
            <div class="form-group col-quarter">
              <label for="pkg-dest-city">Destination City *</label>
              <input type="text" id="pkg-dest-city" class="form-input" required maxlength="100" placeholder="e.g. Gulmarg" value="${escapeHtml(pkg?.destinationCity || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-quarter">
              <label for="pkg-adult-price">Base Adult Price (₹) *</label>
              <input type="number" id="pkg-adult-price" class="form-input" required min="0" step="1" placeholder="e.g. 35000" value="${currentBasePriceINR || ''}" />
            </div>
            <div class="form-group col-quarter">
              <label for="pkg-child-price">Base Child Price (₹)</label>
              <input type="number" id="pkg-child-price" class="form-input" min="0" step="1" placeholder="e.g. 18000" value="${currentChildPriceINR || ''}" />
            </div>
            <div class="form-group col-quarter">
              <label for="pkg-currency">Currency</label>
              <select id="pkg-currency" class="form-select">
                <option value="INR" ${pkg?.currency === 'INR' || !pkg?.currency ? 'selected' : ''}>INR (₹)</option>
                <option value="USD" ${pkg?.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
              </select>
            </div>
            <div class="form-group col-quarter">
              <label for="pkg-hero-image">Hero Image URL *</label>
              <input type="url" id="pkg-hero-image" class="form-input" required placeholder="https://images.unsplash.com/..." value="${escapeHtml(pkg?.heroImageUrl || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="pkg-inclusions">Inclusions (Comma separated)</label>
              <input type="text" id="pkg-inclusions" class="form-input" placeholder="Breakfast, 4-star Hotel, Airport Transfers, Sightseeing" value="${escapeHtml((pkg?.inclusions || []).join(', '))}" />
            </div>
            <div class="form-group col-half">
              <label for="pkg-exclusions">Exclusions (Comma separated)</label>
              <input type="text" id="pkg-exclusions" class="form-input" placeholder="Airfare, Personal Expenses, Travel Insurance" value="${escapeHtml((pkg?.exclusions || []).join(', '))}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-half checkbox-group">
              <label class="checkbox-label" for="pkg-is-published">
                <input type="checkbox" id="pkg-is-published" ${pkg?.isPublished ? 'checked' : ''} />
                <span>Published (Visible in search/catalogue)</span>
              </label>
            </div>
            <div class="form-group col-half checkbox-group">
              <label class="checkbox-label" for="pkg-is-featured">
                <input type="checkbox" id="pkg-is-featured" ${pkg?.isFeatured ? 'checked' : ''} />
                <span>Featured on Homepage</span>
              </label>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="admin-pkg-form-cancel">Cancel</button>
            <button type="submit" class="btn-primary" id="admin-pkg-form-submit">
              ${isEdit ? 'Save Changes' : 'Create Package'}
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

    modal.querySelector('#admin-pkg-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#admin-pkg-form-cancel')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#admin-pkg-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBanner = modal.querySelector('#admin-pkg-form-error');
      const submitBtn = modal.querySelector('#admin-pkg-form-submit');

      const destinationId = modal.querySelector('#pkg-destination')?.value;
      const themeId = modal.querySelector('#pkg-theme')?.value || null;
      const title = modal.querySelector('#pkg-title')?.value.trim();
      const slug = modal.querySelector('#pkg-slug')?.value.trim().toLowerCase();
      const shortDescription = modal.querySelector('#pkg-short-desc')?.value.trim();
      const description = modal.querySelector('#pkg-desc')?.value.trim();
      const durationDays = parseInt(modal.querySelector('#pkg-duration-days')?.value, 10);
      const durationNights = parseInt(modal.querySelector('#pkg-duration-nights')?.value, 10);
      const originCity = modal.querySelector('#pkg-origin')?.value.trim();
      const destinationCity = modal.querySelector('#pkg-dest-city')?.value.trim();
      const adultPriceRupees = parseFloat(modal.querySelector('#pkg-adult-price')?.value) || 0;
      const childPriceRupees = parseFloat(modal.querySelector('#pkg-child-price')?.value) || 0;
      const currency = modal.querySelector('#pkg-currency')?.value || 'INR';
      const heroImageUrl = modal.querySelector('#pkg-hero-image')?.value.trim();
      const inclusionsRaw = modal.querySelector('#pkg-inclusions')?.value.trim();
      const exclusionsRaw = modal.querySelector('#pkg-exclusions')?.value.trim();
      const isPublished = modal.querySelector('#pkg-is-published')?.checked ?? false;
      const isFeatured = modal.querySelector('#pkg-is-featured')?.checked ?? false;

      // Minor units conversion
      const baseAdultPrice = Math.round(adultPriceRupees * 100);
      const baseChildPrice = Math.round(childPriceRupees * 100);

      const inclusions = inclusionsRaw
        ? inclusionsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const exclusions = exclusionsRaw
        ? exclusionsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const payload = {
        destinationId,
        themeId,
        title,
        slug,
        shortDescription,
        description,
        durationDays,
        durationNights,
        originCity,
        destinationCity,
        baseAdultPrice,
        baseChildPrice,
        currency,
        heroImageUrl,
        inclusions,
        exclusions,
        isPublished,
        isFeatured,
      };

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        errorBanner.classList.add('hidden');

        if (isEdit) {
          await api.updateAdminPackage(pkg.id, payload);
        } else {
          await api.createAdminPackage(payload);
        }

        closeModal();
        await this.loadPackages(container);
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to save tour package.';
        errorBanner.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Create Package';
      }
    });
  }

  /**
   * Open Itinerary Builder Modal for a package.
   */
  static openItineraryModal(container, pkg) {
    const modal = container.querySelector('#admin-itinerary-form-modal');
    if (!modal) return;

    const existingDays =
      Array.isArray(pkg.itinerary) && pkg.itinerary.length > 0
        ? pkg.itinerary
        : Array.from({ length: pkg.durationDays || 3 }, (_, i) => ({
            dayNumber: i + 1,
            title: `Day ${i + 1}: Sightseeing`,
            activityDescription: 'Explore scenic viewpoints and historical landmarks.',
            mealsIncluded: ['BREAKFAST'],
            accommodationNotes: 'Hotel stay included',
          }));

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog admin-modal-large">
        <div class="modal-header">
          <h3>Itinerary Builder — ${escapeHtml(pkg.title)}</h3>
          <button type="button" class="btn-close-modal" id="admin-itin-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <form id="admin-itin-form" class="admin-modal-form">
          <div id="admin-itin-form-error" class="form-error-banner hidden" role="alert"></div>

          <div id="itinerary-days-container" class="itinerary-days-list">
            ${existingDays
              .map(
                (day, idx) => `
              <div class="itinerary-day-card" data-day-index="${idx}">
                <div class="itinerary-day-card-header">
                  <strong>Day <span class="day-num-display">${day.dayNumber || idx + 1}</span></strong>
                </div>
                <div class="form-group">
                  <label>Day Title *</label>
                  <input type="text" class="form-input itin-day-title" required value="${escapeHtml(day.title || '')}" placeholder="e.g. Arrival in Srinagar & Dal Lake Shikara Ride" />
                </div>
                <div class="form-group">
                  <label>Activity Description *</label>
                  <textarea class="form-textarea itin-day-desc" rows="2" required placeholder="Detailed activity description...">${escapeHtml(day.activityDescription || '')}</textarea>
                </div>
                <div class="form-group">
                  <label>Accommodation Notes</label>
                  <input type="text" class="form-input itin-day-hotel" value="${escapeHtml(day.accommodationNotes || '')}" placeholder="e.g. 4-star Deluxe Houseboat" />
                </div>
              </div>
            `,
              )
              .join('')}
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="admin-itin-form-cancel">Cancel</button>
            <button type="submit" class="btn-primary" id="admin-itin-form-submit">Save Itinerary</button>
          </div>
        </form>
      </div>
    `;

    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    };

    modal.querySelector('#admin-itin-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#admin-itin-form-cancel')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#admin-itin-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBanner = modal.querySelector('#admin-itin-form-error');
      const submitBtn = modal.querySelector('#admin-itin-form-submit');

      const cards = modal.querySelectorAll('.itinerary-day-card');
      const itineraryDays = [];

      cards.forEach((card, idx) => {
        const title = card.querySelector('.itin-day-title')?.value.trim();
        const activityDescription = card.querySelector('.itin-day-desc')?.value.trim();
        const accommodationNotes = card.querySelector('.itin-day-hotel')?.value.trim() || null;

        itineraryDays.push({
          dayNumber: idx + 1,
          title,
          activityDescription,
          mealsIncluded: ['BREAKFAST'],
          accommodationNotes,
        });
      });

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving Itinerary...';
        errorBanner.classList.add('hidden');

        await api.setAdminPackageItinerary(pkg.id, { itineraryDays });
        closeModal();
        await this.loadPackages(container);
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to update itinerary.';
        errorBanner.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Itinerary';
      }
    });
  }
}
