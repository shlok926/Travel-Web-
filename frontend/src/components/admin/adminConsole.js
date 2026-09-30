import { authStore } from '../../state/auth.js';
import { escapeHtml } from '../../utils/formatters.js';
import { AdminDashboardTab } from './adminDashboardTab.js';
import { AdminSlidersTab } from './adminSlidersTab.js';
import { AdminPagesTab } from './adminPagesTab.js';
import { AdminPackagesTab } from './adminPackagesTab.js';
import { AdminInventoryTab } from './adminInventoryTab.js';
import { AdminBookingsTab } from './adminBookingsTab.js';
import { AdminCancellationsTab } from './adminCancellationsTab.js';
import { AdminAuditTab } from './adminAuditTab.js';

/**
 * Master Admin Console Component
 * Provides complete administrative portal shell, sidebar navigation, and RBAC UI guards.
 */
export class AdminConsole {
  static activeTab = 'dashboard';
  static isOpen = false;

  /**
   * Initialize Admin Console container in the DOM.
   */
  static init() {
    let modal = document.getElementById('admin-console-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'admin-console-modal';
      modal.className = 'admin-modal-backdrop hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Admin Console');
      document.body.appendChild(modal);
    }
  }

  /**
   * Open the Admin Console.
   * @param {string} [tab='dashboard']
   */
  static open(tab = 'dashboard') {
    this.init();
    this.activeTab = tab;
    this.isOpen = true;

    const modal = document.getElementById('admin-console-modal');
    if (!modal) return;

    // RBAC UI Guard
    const user = authStore.getUser();
    const isAuthorizedAdmin = authStore.isAuthenticated() && user?.role === 'ADMIN';

    if (!isAuthorizedAdmin) {
      this.renderAccessDenied(modal);
      modal.classList.remove('hidden');
      return;
    }

    this.renderShell(modal);
    modal.classList.remove('hidden');
    this.switchTab(this.activeTab);
  }

  /**
   * Close the Admin Console.
   */
  static close() {
    this.isOpen = false;
    const modal = document.getElementById('admin-console-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    }
  }

  /**
   * Render Access Denied state for unauthenticated or non-admin users.
   */
  static renderAccessDenied(modal) {
    modal.innerHTML = `
      <div class="admin-shell-dialog access-denied-dialog">
        <div class="modal-header">
          <h3>Access Denied</h3>
          <button type="button" class="btn-close-modal" id="admin-close-btn" aria-label="Close">✕</button>
        </div>
        <div class="admin-error-state">
          <div class="error-icon">🚫</div>
          <h3>Administrator Privileges Required</h3>
          <p>You must be signed in with an administrative account (ADMIN role) to access the operations console.</p>
          <button type="button" class="btn-primary" id="admin-denied-close-btn">Return to Website</button>
        </div>
      </div>
    `;

    modal.querySelector('#admin-close-btn')?.addEventListener('click', () => this.close());
    modal.querySelector('#admin-denied-close-btn')?.addEventListener('click', () => this.close());
  }

  /**
   * Render complete Admin Console Shell.
   */
  static renderShell(modal) {
    const user = authStore.getUser() || {};
    const safeName = escapeHtml(user.fullName || user.email || 'Admin');

    modal.innerHTML = `
      <div class="admin-shell">
        <!-- Sidebar Navigation -->
        <aside class="admin-sidebar" aria-label="Admin Navigation">
          <div class="admin-brand">
            <div class="brand-badge">⚡ Operations</div>
            <h1 class="brand-title">Young Admin</h1>
          </div>

          <nav class="admin-nav" role="tablist">
            <button type="button" class="admin-nav-item ${this.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" role="tab">
              <span class="nav-icon">📊</span>
              <span>Dashboard</span>
            </button>
            <div class="admin-nav-section-title">CMS & Media</div>
            <button type="button" class="admin-nav-item ${this.activeTab === 'sliders' ? 'active' : ''}" data-tab="sliders" role="tab">
              <span class="nav-icon">🖼️</span>
              <span>Hero Sliders</span>
            </button>
            <button type="button" class="admin-nav-item ${this.activeTab === 'pages' ? 'active' : ''}" data-tab="pages" role="tab">
              <span class="nav-icon">📄</span>
              <span>CMS Pages</span>
            </button>
            <div class="admin-nav-section-title">Catalogue & Scheduling</div>
            <button type="button" class="admin-nav-item ${this.activeTab === 'packages' ? 'active' : ''}" data-tab="packages" role="tab">
              <span class="nav-icon">📦</span>
              <span>Tour Packages</span>
            </button>
            <button type="button" class="admin-nav-item ${this.activeTab === 'departures' ? 'active' : ''}" data-tab="departures" role="tab">
              <span class="nav-icon">🗓️</span>
              <span>Departures</span>
            </button>
            <div class="admin-nav-section-title">Bookings & Operations</div>
            <button type="button" class="admin-nav-item ${this.activeTab === 'bookings' ? 'active' : ''}" data-tab="bookings" role="tab">
              <span class="nav-icon">📑</span>
              <span>Bookings</span>
            </button>
            <button type="button" class="admin-nav-item ${this.activeTab === 'cancellations' ? 'active' : ''}" data-tab="cancellations" role="tab">
              <span class="nav-icon">⚖️</span>
              <span>Cancellations</span>
            </button>
            <div class="admin-nav-section-title">System & Security</div>
            <button type="button" class="admin-nav-item ${this.activeTab === 'audit' ? 'active' : ''}" data-tab="audit" role="tab">
              <span class="nav-icon">📜</span>
              <span>Audit Logs</span>
            </button>
          </nav>

          <div class="admin-sidebar-footer">
            <div class="admin-user-info">
              <span class="user-avatar">👤</span>
              <div class="user-meta">
                <span class="user-name">${safeName}</span>
                <span class="user-role-badge">ADMIN</span>
              </div>
            </div>
          </div>
        </aside>

        <!-- Main Content Area -->
        <main class="admin-main">
          <header class="admin-topbar">
            <div class="admin-topbar-left">
              <span class="admin-section-breadcrumb" id="admin-breadcrumb">Dashboard</span>
            </div>
            <div class="admin-topbar-right">
              <button type="button" class="btn-close-console" id="admin-close-shell-btn" aria-label="Exit Admin Console">
                ✕ Exit Console
              </button>
            </div>
          </header>

          <div class="admin-tab-content" id="admin-active-tab-container" role="tabpanel">
            <!-- Active Tab View Mounted Here -->
          </div>
        </main>
      </div>
    `;

    // Event listeners
    modal.querySelector('#admin-close-shell-btn')?.addEventListener('click', () => this.close());

    modal.querySelectorAll('.admin-nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });
  }

  /**
   * Switch active tab view.
   * @param {string} tab
   */
  static switchTab(tab) {
    this.activeTab = tab;
    const modal = document.getElementById('admin-console-modal');
    if (!modal) return;

    // Update active nav items
    modal.querySelectorAll('.admin-nav-item').forEach((item) => {
      if (item.getAttribute('data-tab') === tab) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update breadcrumb
    const breadcrumb = modal.querySelector('#admin-breadcrumb');
    const tabLabels = {
      dashboard: 'Dashboard Overview',
      sliders: 'CMS / Hero Sliders',
      pages: 'CMS / Static Pages',
      packages: 'Catalogue / Tour Packages',
      departures: 'Inventory / Departure Schedules',
      bookings: 'Operations / Bookings & Manifests',
      cancellations: 'Operations / Cancellation Queue',
      audit: 'Security / Audit Trail',
    };
    if (breadcrumb) {
      breadcrumb.textContent = tabLabels[tab] || 'Admin Console';
    }

    // Mount active tab view
    const container = modal.querySelector('#admin-active-tab-container');
    if (!container) return;

    switch (tab) {
      case 'dashboard':
        AdminDashboardTab.render(container);
        break;
      case 'sliders':
        AdminSlidersTab.render(container);
        break;
      case 'pages':
        AdminPagesTab.render(container);
        break;
      case 'packages':
        AdminPackagesTab.render(container);
        break;
      case 'departures':
        AdminInventoryTab.render(container);
        break;
      case 'bookings':
        AdminBookingsTab.render(container);
        break;
      case 'cancellations':
        AdminCancellationsTab.render(container);
        break;
      case 'audit':
        AdminAuditTab.render(container);
        break;
      default:
        AdminDashboardTab.render(container);
    }
  }
}
