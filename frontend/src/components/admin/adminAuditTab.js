import { api } from '../../api/client.js';
import { escapeHtml } from '../../utils/formatters.js';

/**
 * Admin Read-Only Audit Logs Tab
 *
 * CRITICAL IMMUTABILITY INVARIANT:
 * Audit logs are strictly append-only. There are NO create, edit, or delete actions.
 */
export class AdminAuditTab {
  /**
   * Render Audit Logs Tab.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">Security & Operational Audit Trail</h2>
          <p class="admin-tab-subtitle">Immutable, append-only record of administrative actions and security-critical mutations</p>
        </div>
      </div>

      <div class="admin-filter-bar">
        <div class="filter-group">
          <label for="admin-audit-action-filter" class="filter-label">Action</label>
          <input type="text" id="admin-audit-action-filter" class="filter-input" placeholder="e.g. PACKAGE_PUBLISH" />
        </div>
        <div class="filter-group">
          <label for="admin-audit-entity-filter" class="filter-label">Entity Type</label>
          <input type="text" id="admin-audit-entity-filter" class="filter-input" placeholder="e.g. tour_packages" />
        </div>
        <div class="filter-group">
          <label for="admin-audit-entityid-filter" class="filter-label">Entity ID</label>
          <input type="text" id="admin-audit-entityid-filter" class="filter-input" placeholder="Filter by UUID / ID" />
        </div>
      </div>

      <div id="admin-audit-table-container" class="admin-table-container">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading audit trail...</p>
        </div>
      </div>

      <!-- Audit Detail Modal -->
      <div id="admin-audit-detail-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="Audit Log Details"></div>
    `;

    const actionFilter = container.querySelector('#admin-audit-action-filter');
    const entityFilter = container.querySelector('#admin-audit-entity-filter');
    const entityIdFilter = container.querySelector('#admin-audit-entityid-filter');

    let debounceTimer = null;
    const triggerSearch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this.loadAuditLogs(container), 350);
    };

    actionFilter?.addEventListener('input', triggerSearch);
    entityFilter?.addEventListener('input', triggerSearch);
    entityIdFilter?.addEventListener('input', triggerSearch);

    await this.loadAuditLogs(container);
  }

  static async loadAuditLogs(container) {
    const tableContainer = container.querySelector('#admin-audit-table-container');
    const actionFilter = container.querySelector('#admin-audit-action-filter');
    const entityFilter = container.querySelector('#admin-audit-entity-filter');
    const entityIdFilter = container.querySelector('#admin-audit-entityid-filter');
    if (!tableContainer) return;

    const action = actionFilter?.value.trim() || undefined;
    const entityType = entityFilter?.value.trim() || undefined;
    const entityId = entityIdFilter?.value.trim() || undefined;

    tableContainer.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading audit trail...</p>
      </div>
    `;

    try {
      const response = await api.getAdminAuditLogs({
        limit: 50,
        action,
        entityType,
        entityId,
      });
      const items = Array.isArray(response) ? response : response?.items || response?.data || [];

      if (!items || items.length === 0) {
        tableContainer.innerHTML = `
          <div class="admin-empty-state">
            <div class="empty-icon">📜</div>
            <h3>No Audit Logs Recorded</h3>
            <p>Administrative mutations and operations will appear here as they occur.</p>
          </div>
        `;
        return;
      }

      tableContainer.innerHTML = `
        <table class="admin-table" aria-label="Audit logs list">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Admin Actor</th>
              <th>Action</th>
              <th>Entity Type & ID</th>
              <th>Client IP</th>
              <th class="text-right">Payload Details</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (log) => `
              <tr data-audit-id="${escapeHtml(log.id)}">
                <td>
                  <span class="text-muted">${log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</span>
                </td>
                <td>
                  <code class="code-badge">${escapeHtml((log.adminId || '').substring(0, 8))}...</code>
                </td>
                <td>
                  <span class="badge badge-info">${escapeHtml(log.action)}</span>
                </td>
                <td>
                  <div><strong>${escapeHtml(log.entityType)}</strong></div>
                  <code class="table-secondary-text">${escapeHtml(log.entityId)}</code>
                </td>
                <td>
                  <span class="text-muted">${escapeHtml(log.ipAddress || '—')}</span>
                </td>
                <td class="text-right">
                  <button type="button" class="btn-action btn-inspect-audit" data-id="${escapeHtml(log.id)}" title="Inspect Audit Record">🔍 Inspect</button>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `;

      tableContainer.querySelectorAll('.btn-inspect-audit').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            const log = await api.getAdminAuditLogById(id);
            this.openAuditModal(container, log);
          } catch (err) {
            alert(`Error loading audit record: ${err.message}`);
          }
        });
      });
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load audit logs</h3>
          <p>${escapeHtml(err.message || 'Error occurred while loading audit trail.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-audit-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = tableContainer.querySelector('#admin-audit-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadAuditLogs(container));
      }
    }
  }

  /**
   * Open Audit Record Inspection Modal.
   */
  static openAuditModal(container, log) {
    const modal = container.querySelector('#admin-audit-detail-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-dialog admin-modal-dialog admin-modal-large">
        <div class="modal-header">
          <h3>Audit Record Details</h3>
          <button type="button" class="btn-close-modal" id="admin-audit-modal-close" aria-label="Close dialog">✕</button>
        </div>
        <div class="modal-body">
          <div class="booking-detail-grid">
            <div class="detail-card">
              <h4>Audit Metadata</h4>
              <p><strong>Action:</strong> <span class="badge badge-info">${escapeHtml(log.action)}</span></p>
              <p><strong>Entity Type:</strong> ${escapeHtml(log.entityType)}</p>
              <p><strong>Entity ID:</strong> <code>${escapeHtml(log.entityId)}</code></p>
            </div>
            <div class="detail-card">
              <h4>Actor & Origin</h4>
              <p><strong>Admin ID:</strong> <code>${escapeHtml(log.adminId)}</code></p>
              <p><strong>IP Address:</strong> ${escapeHtml(log.ipAddress || '—')}</p>
              <p><strong>Timestamp:</strong> ${log.createdAt ? new Date(log.createdAt).toISOString() : '—'}</p>
            </div>
          </div>

          <h4 class="section-subtitle">Mutation Details (JSON Payload)</h4>
          <pre class="code-preview-box"><code>${escapeHtml(JSON.stringify(log.details || {}, null, 2))}</code></pre>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    };

    modal.querySelector('#admin-audit-modal-close')?.addEventListener('click', closeModal);
  }
}
