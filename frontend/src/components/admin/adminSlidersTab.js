import { api } from '../../api/client.js';
import { escapeHtml } from '../../utils/formatters.js';

/**
 * Admin Hero Slider Management Tab
 */
export class AdminSlidersTab {
  /**
   * Render Sliders Tab.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">Hero Slider Management</h2>
          <p class="admin-tab-subtitle">Configure homepage hero banners, call-to-action links, and visual sequence</p>
        </div>
        <div class="admin-tab-actions">
          <button type="button" class="btn-primary btn-sm" id="admin-create-slider-btn">
            + New Hero Slider
          </button>
        </div>
      </div>

      <div class="admin-filter-bar">
        <div class="filter-group">
          <label for="admin-slider-status-filter" class="filter-label">Status</label>
          <select id="admin-slider-status-filter" class="filter-select">
            <option value="">All Sliders</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </select>
        </div>
      </div>

      <div id="admin-sliders-table-container" class="admin-table-container">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading hero sliders...</p>
        </div>
      </div>

      <!-- Hero Slider Form Modal Container -->
      <div id="admin-slider-form-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Hero Slider Editor"></div>
    `;

    const createBtn = container.querySelector('#admin-create-slider-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.openFormModal(container, null));
    }

    const filterSelect = container.querySelector('#admin-slider-status-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => this.loadSliders(container));
    }

    await this.loadSliders(container);
  }

  static async loadSliders(container) {
    const tableContainer = container.querySelector('#admin-sliders-table-container');
    if (!tableContainer) return;

    const filterSelect = container.querySelector('#admin-slider-status-filter');
    const isActive = filterSelect?.value || undefined;

    tableContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading hero sliders...</p>
      </div>
    `;

    try {
      const response = await api.getAdminHeroSliders({ limit: 50, isActive });
      const items = Array.isArray(response) ? response : response?.items || response?.data || [];

      if (!items || items.length === 0) {
        tableContainer.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">🖼️</div>
            <h3>No Hero Sliders Found</h3>
            <p>Create your first hero slider to showcase destinations and featured tours on the homepage.</p>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <table class="admin-table" aria-label="Hero sliders list">
          <thead>
            <tr>
              <th>Order</th>
              <th>Banner Preview</th>
              <th>Title & Subtitle</th>
              <th>CTA Link</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr data-slider-id="${escapeHtml(item.id)}">
                <td><span class="badge-order">${escapeHtml(item.sortOrder ?? 0)}</span></td>
                <td>
                  <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" class="admin-thumb-img" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2280%22%20height%3D%2250%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23444%22%2F%3E%3C%2Fsvg%3E'"/>
                </td>
                <td>
                  <div class="table-primary-text">${escapeHtml(item.title)}</div>
                  ${item.subtitle ? `<div class="table-secondary-text">${escapeHtml(item.subtitle)}</div>` : ''}
                </td>
                <td>
                  ${
                    item.ctaLabel
                      ? `<a href="${escapeHtml(item.ctaUrl || '#')}" target="_blank" rel="noopener noreferrer" class="admin-link">${escapeHtml(item.ctaLabel)} ↗</a>`
                      : '<span class="text-muted">—</span>'
                  }
                </td>
                <td>
                  <span class="badge ${item.isActive ? 'badge-success' : 'badge-secondary'}">
                    ${item.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td class="text-right">
                  <button type="button" class="btn-action btn-edit-slider" data-id="${escapeHtml(item.id)}" title="Edit Slider">✏️ Edit</button>
                  <button type="button" class="btn-action btn-danger btn-delete-slider" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" title="Delete Slider">🗑️ Delete</button>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;

      // Attach button event handlers
      tableContainer.querySelectorAll('.btn-edit-slider').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            const slider = await api.getAdminHeroSliderById(id);
            this.openFormModal(container, slider);
          } catch (err) {
            alert(`Error loading slider: ${err.message}`);
          }
        });
      });

      tableContainer.querySelectorAll('.btn-delete-slider').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const title = btn.getAttribute('data-title');
          if (confirm(`Are you sure you want to delete the hero slider "${title}"?`)) {
            try {
              await api.deleteAdminHeroSlider(id);
              await this.loadSliders(container);
            } catch (err) {
              alert(`Failed to delete slider: ${err.message}`);
            }
          }
        });
      });
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load hero sliders</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading sliders.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-sliders-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = tableContainer.querySelector('#admin-sliders-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadSliders(container));
      }
    }
  }

  /**
   * Open create/edit modal form for hero slider.
   * @param {any} container
   * @param {any} [slider=null]
   */
  static openFormModal(container, slider = null) {
    const modal = container.querySelector('#admin-slider-form-modal');
    if (!modal) return;

    const isEdit = Boolean(slider?.id);

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Hero Slider' : 'Create New Hero Slider'}</h3>
          <button type="button" class="btn-close-modal" id="admin-slider-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <form id="admin-slider-form" class="admin-modal-form">
          <div id="admin-slider-form-error" class="form-error-banner hidden" role="alert"></div>

          <div class="form-group">
            <label for="slider-title">Banner Title *</label>
            <input type="text" id="slider-title" class="form-input" required maxlength="128" placeholder="e.g. Discover Paradise in Kashmir" value="${escapeHtml(slider?.title || '')}" />
          </div>

          <div class="form-group">
            <label for="slider-subtitle">Subtitle / Tagline</label>
            <input type="text" id="slider-subtitle" class="form-input" maxlength="256" placeholder="e.g. Exclusive 5-star mountain getaways with Young Tours" value="${escapeHtml(slider?.subtitle || '')}" />
          </div>

          <div class="form-group">
            <label for="slider-image-url">Image URL *</label>
            <input type="url" id="slider-image-url" class="form-input" required maxlength="512" placeholder="https://images.unsplash.com/..." value="${escapeHtml(slider?.imageUrl || '')}" />
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="slider-cta-label">CTA Button Label</label>
              <input type="text" id="slider-cta-label" class="form-input" maxlength="64" placeholder="e.g. Explore Packages" value="${escapeHtml(slider?.ctaLabel || '')}" />
            </div>
            <div class="form-group col-half">
              <label for="slider-cta-url">CTA URL Destination</label>
              <input type="text" id="slider-cta-url" class="form-input" maxlength="256" placeholder="e.g. #packages or /packages" value="${escapeHtml(slider?.ctaUrl || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="slider-sort-order">Sort Order</label>
              <input type="number" id="slider-sort-order" class="form-input" min="0" step="1" value="${slider?.sortOrder ?? 0}" />
            </div>
            <div class="form-group col-half checkbox-group">
              <label class="checkbox-label" for="slider-is-active">
                <input type="checkbox" id="slider-is-active" ${slider?.isActive !== false ? 'checked' : ''} />
                <span>Active on Homepage</span>
              </label>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="admin-slider-form-cancel">Cancel</button>
            <button type="submit" class="btn-primary" id="admin-slider-form-submit">
              ${isEdit ? 'Save Changes' : 'Create Slider'}
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

    modal.querySelector('#admin-slider-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#admin-slider-form-cancel')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#admin-slider-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBanner = modal.querySelector('#admin-slider-form-error');
      const submitBtn = modal.querySelector('#admin-slider-form-submit');

      const title = modal.querySelector('#slider-title')?.value.trim();
      const subtitle = modal.querySelector('#slider-subtitle')?.value.trim() || null;
      const imageUrl = modal.querySelector('#slider-image-url')?.value.trim();
      const ctaLabel = modal.querySelector('#slider-cta-label')?.value.trim() || null;
      const ctaUrl = modal.querySelector('#slider-cta-url')?.value.trim() || null;
      const sortOrder = parseInt(modal.querySelector('#slider-sort-order')?.value, 10) || 0;
      const isActive = modal.querySelector('#slider-is-active')?.checked ?? true;

      if (!title) {
        errorBanner.textContent = 'Banner title is required.';
        errorBanner.classList.remove('hidden');
        return;
      }
      if (!imageUrl) {
        errorBanner.textContent = 'Image URL is required.';
        errorBanner.classList.remove('hidden');
        return;
      }

      const payload = {
        title,
        subtitle,
        imageUrl,
        ctaLabel,
        ctaUrl,
        sortOrder,
        isActive,
      };

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        errorBanner.classList.add('hidden');

        if (isEdit) {
          await api.updateAdminHeroSlider(slider.id, payload);
        } else {
          await api.createAdminHeroSlider(payload);
        }

        closeModal();
        await this.loadSliders(container);
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to save hero slider.';
        errorBanner.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Create Slider';
      }
    });
  }
}
