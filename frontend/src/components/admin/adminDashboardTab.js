import { api } from '../../api/client.js';
import { escapeHtml } from '../../utils/formatters.js';

/**
 * Admin Dashboard Tab Component
 * Displays authoritative operational statistics returned by GET /api/v1/admin/dashboard/stats.
 * Note: Revenue and financial forecasts are strictly excluded as semantics are [UNKNOWN].
 */
export class AdminDashboardTab {
  /**
   * Render Dashboard Tab container and fetch operational stats.
   * @param {HTMLElement} container
   */
  static async render(container) {
    container.innerHTML = `
      <div class="admin-tab-header">
        <div>
          <h2 class="admin-tab-title">Operational Dashboard</h2>
          <p class="admin-tab-subtitle">Real-time system overview and operational capacity metrics</p>
        </div>
        <button type="button" class="btn-secondary btn-sm" id="admin-dashboard-refresh-btn" aria-label="Refresh stats">
          🔄 Refresh
        </button>
      </div>
      <div id="admin-dashboard-content" class="admin-dashboard-body">
        <div class="admin-loading-state">
          <div class="spinner"></div>
          <p>Loading operational statistics...</p>
        </div>
      </div>
    `;

    const refreshBtn = container.querySelector('#admin-dashboard-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadStats(container));
    }

    await this.loadStats(container);
  }

  static async loadStats(container) {
    const body = container.querySelector('#admin-dashboard-content');
    if (!body) return;

    body.innerHTML = `
      <div class="admin-loading-state">
        <div class="spinner"></div>
        <p>Loading operational statistics...</p>
      </div>
    `;

    try {
      const stats = await api.getAdminDashboardStats();
      this.renderStats(body, stats);
    } catch (err) {
      body.innerHTML = `
        <div class="admin-error-state" role="alert">
          <div class="error-icon">⚠️</div>
          <h3>Failed to load dashboard metrics</h3>
          <p>${escapeHtml(err.message || 'An error occurred while fetching operational stats.')}</p>
          <button type="button" class="btn-primary btn-sm" id="admin-dashboard-retry-btn">Try Again</button>
        </div>
      `;
      const retryBtn = body.querySelector('#admin-dashboard-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadStats(container));
      }
    }
  }

  static renderStats(body, stats) {
    const totalPackages = stats.totalPackages ?? 0;
    const publishedPackages = stats.publishedPackages ?? 0;
    const draftPackages = stats.draftPackages ?? 0;
    const totalDestinations = stats.totalDestinations ?? 0;
    const totalThemes = stats.totalThemes ?? 0;
    const totalDepartures = stats.totalDepartures ?? 0;
    const openDepartures = stats.openDepartures ?? 0;
    const upcomingDeparturesCount = stats.upcomingDeparturesCount ?? 0;
    const totalBookings = stats.totalBookings ?? 0;
    const confirmedBookings = stats.confirmedBookings ?? 0;
    const awaitingPaymentBookings = stats.awaitingPaymentBookings ?? 0;
    const cancelledBookings = stats.cancelledBookings ?? 0;
    const pendingCancellations = stats.pendingCancellations ?? 0;
    const utilization = Number(stats.inventoryUtilizationPercent ?? 0).toFixed(1);

    body.innerHTML = `
      <div class="admin-stats-grid">
        <!-- Tour Packages & Catalogue -->
        <div class="admin-stat-card">
          <div class="stat-icon-wrapper" style="background: rgba(46, 204, 113, 0.15); color: #2ecc71;">📦</div>
          <div class="stat-details">
            <span class="stat-label">Tour Packages</span>
            <span class="stat-value" id="stat-total-packages">${totalPackages}</span>
            <span class="stat-subtext">${publishedPackages} published · ${draftPackages} draft</span>
          </div>
        </div>

        <!-- Destinations & Themes -->
        <div class="admin-stat-card">
          <div class="stat-icon-wrapper" style="background: rgba(52, 152, 219, 0.15); color: #3498db;">🗺️</div>
          <div class="stat-details">
            <span class="stat-label">Catalogue Coverage</span>
            <span class="stat-value" id="stat-catalogue-coverage">${totalDestinations} Destinations</span>
            <span class="stat-subtext">${totalThemes} Tour Themes</span>
          </div>
        </div>

        <!-- Departures & Capacity -->
        <div class="admin-stat-card">
          <div class="stat-icon-wrapper" style="background: rgba(241, 196, 15, 0.15); color: #f1c40f;">🗓️</div>
          <div class="stat-details">
            <span class="stat-label">Departures</span>
            <span class="stat-value" id="stat-total-departures">${totalDepartures}</span>
            <span class="stat-subtext">${openDepartures} open · ${upcomingDeparturesCount} upcoming</span>
          </div>
        </div>

        <!-- Inventory Utilization -->
        <div class="admin-stat-card">
          <div class="stat-icon-wrapper" style="background: rgba(155, 89, 182, 0.15); color: #9b59b6;">📊</div>
          <div class="stat-details">
            <span class="stat-label">Seat Utilization</span>
            <span class="stat-value" id="stat-utilization">${utilization}%</span>
            <div class="progress-bar-bg" aria-hidden="true">
              <div class="progress-bar-fill" style="width: ${Math.min(100, Math.max(0, utilization))}%;"></div>
            </div>
          </div>
        </div>

        <!-- Total Bookings -->
        <div class="admin-stat-card">
          <div class="stat-icon-wrapper" style="background: rgba(230, 126, 34, 0.15); color: #e67e22;">📑</div>
          <div class="stat-details">
            <span class="stat-label">Total Bookings</span>
            <span class="stat-value" id="stat-total-bookings">${totalBookings}</span>
            <span class="stat-subtext">${confirmedBookings} confirmed · ${awaitingPaymentBookings} pending payment</span>
          </div>
        </div>

        <!-- Cancellations & Refunds Queue -->
        <div class="admin-stat-card ${pendingCancellations > 0 ? 'highlight-alert' : ''}">
          <div class="stat-icon-wrapper" style="background: rgba(231, 76, 60, 0.15); color: #e74c3c;">⚖️</div>
          <div class="stat-details">
            <span class="stat-label">Cancellation Reviews</span>
            <span class="stat-value" id="stat-pending-cancellations">${pendingCancellations}</span>
            <span class="stat-subtext">${cancelledBookings} cancelled bookings total</span>
          </div>
        </div>
      </div>
    `;
  }
}
