import { api } from '../../api/client.js';
import { escapeHtml } from '../../utils/formatters.js';

/**
 * Admin CMS Pages Management Tab
 *
 * CRITICAL SECURITY INVARIANT (PHASE 7 STEP 6):
 * CMS `content_html` is UNSANITIZED at the backend level.
 * Therefore, content_html is strictly edited via a textarea/code editor and
 * NEVER rendered directly into the DOM using innerHTML or raw injection.
 */
export class AdminPagesTab {
  /**
   * Render CMS Pages Tab.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">CMS Static Pages</h2>
          <p class="admin-tab-subtitle">Manage terms of service, privacy policies, about pages, and static informational content</p>
        </div>
        <div class="admin-tab-actions">
          <button type="button" class="btn-primary btn-sm" id="admin-create-page-btn">
            + New CMS Page
          </button>
        </div>
      </div>

      <div class="admin-filter-bar">
        <div class="filter-group">
          <label for="admin-page-published-filter" class="filter-label">Publish Status</label>
          <select id="admin-page-published-filter" class="filter-select">
            <option value="">All Pages</option>
            <option value="true">Published Only</option>
            <option value="false">Draft Only</option>
          </select>
        </div>
      </div>

      <div id="admin-pages-table-container" class="admin-table-container">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading CMS pages...</p>
        </div>
      </div>

      <!-- CMS Page Form Modal Container -->
      <div id="admin-page-form-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="CMS Page Editor"></div>
    `;

    const createBtn = container.querySelector('#admin-create-page-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.openFormModal(container, null));
    }

    const filterSelect = container.querySelector('#admin-page-published-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => this.loadPages(container));
    }

    await this.loadPages(container);
  }

  static async loadPages(container) {
    const tableContainer = container.querySelector('#admin-pages-table-container');
    if (!tableContainer) return;

    const filterSelect = container.querySelector('#admin-page-published-filter');
    const isPublished = filterSelect?.value || undefined;

    tableContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading CMS pages...</p>
      </div>
    `;

    try {
      const response = await api.getAdminCmsPages({ limit: 50, isPublished });
      const items = Array.isArray(response) ? response : response?.items || response?.data || [];

      if (!items || items.length === 0) {
        tableContainer.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">📄</div>
            <h3>No Static Pages Found</h3>
            <p>Create a static page (e.g. Terms & Conditions, Privacy Policy, Cancellation Terms).</p>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <table class="admin-table" aria-label="CMS static pages list">
          <thead>
            <tr>
              <th>Page Title</th>
              <th>Slug / Route</th>
              <th>Meta Description</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr data-page-id="${escapeHtml(item.id)}">
                <td>
                  <div class="table-primary-text">${escapeHtml(item.title)}</div>
                </td>
                <td>
                  <code class="code-badge">/pages/${escapeHtml(item.slug)}</code>
                </td>
                <td>
                  <div class="table-secondary-text truncate-text">${escapeHtml(item.metaDescription || '—')}</div>
                </td>
                <td>
                  <span class="badge ${item.isPublished ? 'badge-success' : 'badge-warning'}">
                    ${item.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td>
                  <span class="text-muted">${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}</span>
                </td>
                <td class="text-right">
                  <button type="button" class="btn-action btn-edit-page" data-id="${escapeHtml(item.id)}" title="Edit Page">✏️ Edit</button>
                  <button type="button" class="btn-action btn-danger btn-delete-page" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" title="Delete Page">🗑️ Delete</button>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;

      tableContainer.querySelectorAll('.btn-edit-page').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            const page = await api.getAdminCmsPageById(id);
            this.openFormModal(container, page);
          } catch (err) {
            alert(`Error loading page: ${err.message}`);
          }
        });
      });

      tableContainer.querySelectorAll('.btn-delete-page').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const title = btn.getAttribute('data-title');
          if (confirm(`Are you sure you want to delete the static page "${title}"?`)) {
            try {
              await api.deleteAdminCmsPage(id);
              await this.loadPages(container);
            } catch (err) {
              alert(`Failed to delete page: ${err.message}`);
            }
          }
        });
      });
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load CMS pages</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading pages.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-pages-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = tableContainer.querySelector('#admin-pages-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadPages(container));
      }
    }
  }

  /**
   * Open create/edit modal form for CMS page.
   * @param {any} container
   * @param {any} [page=null]
   */
  static openFormModal(container, page = null) {
    const modal = container.querySelector('#admin-page-form-modal');
    if (!modal) return;

    const isEdit = Boolean(page?.id);

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog admin-modal-large">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit CMS Static Page' : 'Create New CMS Static Page'}</h3>
          <button type="button" class="btn-close-modal" id="admin-page-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <form id="admin-page-form" class="admin-modal-form">
          <div id="admin-page-form-error" class="form-error-banner hidden" role="alert"></div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="cms-page-title">Page Title *</label>
              <input type="text" id="cms-page-title" class="form-input" required maxlength="128" placeholder="e.g. Terms and Conditions" value="${escapeHtml(page?.title || '')}" />
            </div>
            <div class="form-group col-half">
              <label for="cms-page-slug">URL Slug * (lowercase, alphanumeric, hyphens)</label>
              <input type="text" id="cms-page-slug" class="form-input" required maxlength="64" placeholder="e.g. terms-and-conditions" value="${escapeHtml(page?.slug || '')}" />
            </div>
          </div>

          <div class="form-group">
            <label for="cms-page-meta">SEO Meta Description</label>
            <input type="text" id="cms-page-meta" class="form-input" maxlength="256" placeholder="Brief summary for search indexing" value="${escapeHtml(page?.metaDescription || '')}" />
          </div>

          <div class="form-group">
            <div class="field-label-with-hint">
              <label for="cms-page-content">Page Content (HTML / Text Source) *</label>
              <span class="field-hint">Source editor — rendered safely as text source</span>
            </div>
            <textarea id="cms-page-content" class="form-textarea code-editor" rows="12" required placeholder="<h2>Cancellation Policy</h2>\n<p>Young Tours & Travels provides clear refund rules...</p>">${escapeHtml(page?.contentHtml || '')}</textarea>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label" for="cms-page-is-published">
              <input type="checkbox" id="cms-page-is-published" ${page?.isPublished !== false ? 'checked' : ''} />
              <span>Published (Visible to public)</span>
            </label>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="admin-page-form-cancel">Cancel</button>
            <button type="submit" class="btn-primary" id="admin-page-form-submit">
              ${isEdit ? 'Save Changes' : 'Create Page'}
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

    modal.querySelector('#admin-page-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#admin-page-form-cancel')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#admin-page-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBanner = modal.querySelector('#admin-page-form-error');
      const submitBtn = modal.querySelector('#admin-page-form-submit');

      const title = modal.querySelector('#cms-page-title')?.value.trim();
      const slug = modal.querySelector('#cms-page-slug')?.value.trim().toLowerCase();
      const metaDescription = modal.querySelector('#cms-page-meta')?.value.trim() || null;
      const contentHtml = modal.querySelector('#cms-page-content')?.value.trim();
      const isPublished = modal.querySelector('#cms-page-is-published')?.checked ?? true;

      if (!title) {
        errorBanner.textContent = 'Page title is required.';
        errorBanner.classList.remove('hidden');
        return;
      }
      if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        errorBanner.textContent =
          'Slug must contain only lowercase alphanumeric characters and single hyphens.';
        errorBanner.classList.remove('hidden');
        return;
      }
      if (!contentHtml) {
        errorBanner.textContent = 'Page content is required.';
        errorBanner.classList.remove('hidden');
        return;
      }

      const payload = {
        title,
        slug,
        metaDescription,
        contentHtml,
        isPublished,
      };

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        errorBanner.classList.add('hidden');

        if (isEdit) {
          await api.updateAdminCmsPage(page.id, payload);
        } else {
          await api.createAdminCmsPage(payload);
        }

        closeModal();
        await this.loadPages(container);
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to save CMS page.';
        errorBanner.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Create Page';
      }
    });
  }
}
