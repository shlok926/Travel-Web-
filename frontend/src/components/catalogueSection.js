import { api } from '../api/client.js';
import { renderDestinationCard } from './destinationCard.js';
import { renderPackageCard } from './packageCard.js';
import { PackageDetailModal } from './packageDetailModal.js';
import { escapeHtml } from '../utils/formatters.js';

/**
 * Orchestrator component for Dynamic Catalogue Experience
 */
export class CatalogueSection {
  /** @type {{ destinationSlug: string | null, themeSlug: string | null }} */
  static currentFilter = {
    destinationSlug: null,
    themeSlug: null,
  };

  static state = {
    destinations: [],
    themes: [],
    packages: [],
    loadingDestinations: false,
    loadingPackages: false,
    errorDestinations: null,
    errorPackages: null,
  };

  static async init() {
    this.destContainer = document.getElementById('destinations-grid');
    this.pkgContainer = document.getElementById('packages-grid');
    this.themeBar = document.getElementById('theme-filter-bar');
    this.filterStatusContainer = document.getElementById('catalogue-filter-status');

    // Attach search input listener if present in hero
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query) {
          // Find matching destination or scroll to packages
          const matchedDest = this.state.destinations.find(
            (d) =>
              d.cityName.toLowerCase().includes(query) || d.country.toLowerCase().includes(query),
          );
          if (matchedDest) {
            this.filterByDestination(matchedDest.slug);
          } else {
            // Scroll to packages section
            document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    }

    // Handle hash change for deeplinking
    window.addEventListener('hashchange', () => this.handleHashRoute());

    // Initial data fetch
    await Promise.all([this.loadDestinations(), this.loadThemes(), this.loadPackages()]);

    // Check if initial hash specifies a package
    this.handleHashRoute();
  }

  /**
   * Load published destinations from backend API
   */
  static async loadDestinations() {
    if (!this.destContainer) return;
    this.state.loadingDestinations = true;
    this.state.errorDestinations = null;
    this.renderDestinationsLoading();

    try {
      const items = await api.getDestinations({ limit: 12 });
      this.state.destinations = Array.isArray(items) ? items : [];
      this.renderDestinations();
    } catch (err) {
      this.state.errorDestinations = err;
      this.renderDestinationsError(err);
    } finally {
      this.state.loadingDestinations = false;
    }
  }

  /**
   * Load themes from backend API
   */
  static async loadThemes() {
    if (!this.themeBar) return;

    try {
      const themes = await api.getThemes();
      this.state.themes = Array.isArray(themes) ? themes : [];
      this.renderThemes();
    } catch {
      // Themes are supplementary; non-fatal if offline
      this.state.themes = [];
    }
  }

  /**
   * Load published tour packages with active filters
   */
  static async loadPackages() {
    if (!this.pkgContainer) return;
    this.state.loadingPackages = true;
    this.state.errorPackages = null;
    this.renderPackagesLoading();
    this.renderFilterStatus();

    try {
      const params = { limit: 20 };
      if (this.currentFilter.destinationSlug) {
        params.destinationSlug = this.currentFilter.destinationSlug;
      }
      if (this.currentFilter.themeSlug) {
        params.themeSlug = this.currentFilter.themeSlug;
      }

      const items = await api.getPackages(params);
      this.state.packages = Array.isArray(items) ? items : [];
      this.renderPackages();
    } catch (err) {
      this.state.errorPackages = err;
      this.renderPackagesError(err);
    } finally {
      this.state.loadingPackages = false;
    }
  }

  /**
   * Filter packages by Destination Slug
   * @param {string|null} destinationSlug
   */
  static filterByDestination(destinationSlug) {
    this.currentFilter.destinationSlug = destinationSlug;
    this.loadPackages();
    const pkgSection = document.getElementById('packages');
    if (pkgSection) {
      pkgSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Filter packages by Theme Slug
   * @param {string|null} themeSlug
   */
  static filterByTheme(themeSlug) {
    this.currentFilter.themeSlug = themeSlug;
    this.renderThemes();
    this.loadPackages();
  }

  /**
   * Clear all active catalogue filters
   */
  static clearFilters() {
    this.currentFilter.destinationSlug = null;
    this.currentFilter.themeSlug = null;
    this.renderThemes();
    this.loadPackages();
  }

  /**
   * Open Package Detail modal by package slug
   * @param {string} slug
   */
  static async openPackageDetail(slug) {
    if (!slug) return;
    try {
      const pkg = await api.getPackageBySlug(slug);
      PackageDetailModal.open(pkg);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Unable to load package details: ${err.message || 'Package not found'}`);
    }
  }

  /**
   * Handle hash-based deeplinking (e.g. #package/kashmir-honeymoon)
   */
  static handleHashRoute() {
    const hash = window.location.hash;
    if (hash.startsWith('#package/')) {
      const slug = hash.replace('#package/', '').trim();
      if (slug) {
        this.openPackageDetail(slug);
      }
    }
  }

  // --- Render Methods ---

  static renderDestinationsLoading() {
    if (!this.destContainer) return;
    this.destContainer.innerHTML = Array(3)
      .fill(
        `
      <div class="card skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-content">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-text"></div>
          <div class="skeleton-line skeleton-btn"></div>
        </div>
      </div>
    `,
      )
      .join('');
  }

  static renderDestinationsError(_err) {
    if (!this.destContainer) return;
    this.destContainer.innerHTML = `
      <div class="catalogue-state-card error-state">
        <span class="state-icon" aria-hidden="true">⚠️</span>
        <h3>Unable to load destinations</h3>
        <p>Please check your connection or try again.</p>
        <button type="button" class="btn-primary" id="retry-destinations-btn">Retry</button>
      </div>
    `;
    this.destContainer
      .querySelector('#retry-destinations-btn')
      ?.addEventListener('click', () => this.loadDestinations());
  }

  static renderDestinations() {
    if (!this.destContainer) return;
    if (this.state.destinations.length === 0) {
      this.destContainer.innerHTML = `
        <div class="catalogue-state-card empty-state">
          <span class="state-icon" aria-hidden="true">🌍</span>
          <h3>No destinations found</h3>
          <p>Check back soon for new exotic destinations.</p>
        </div>
      `;
      return;
    }

    this.destContainer.innerHTML = this.state.destinations
      .map((d) => renderDestinationCard(d))
      .join('');

    // Attach click listeners to cards and buttons
    this.destContainer.querySelectorAll('.btn-destination-select').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = btn.getAttribute('data-slug');
        this.filterByDestination(slug);
      });
    });

    this.destContainer.querySelectorAll('.destination-card').forEach((card) => {
      card.addEventListener('click', () => {
        const slug = card.getAttribute('data-slug');
        this.filterByDestination(slug);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const slug = card.getAttribute('data-slug');
          this.filterByDestination(slug);
        }
      });
    });
  }

  static renderThemes() {
    if (!this.themeBar) return;
    if (this.state.themes.length === 0) {
      this.themeBar.innerHTML = '';
      return;
    }

    const allActive = !this.currentFilter.themeSlug;

    this.themeBar.innerHTML = `
      <button type="button" class="theme-pill ${allActive ? 'active' : ''}" data-theme="">
        All Themes
      </button>
      ${this.state.themes
        .map((t) => {
          const isActive = this.currentFilter.themeSlug === t.slug;
          return `
          <button type="button" class="theme-pill ${isActive ? 'active' : ''}" data-theme="${escapeHtml(t.slug)}">
            ${escapeHtml(t.title)}
          </button>
        `;
        })
        .join('')}
    `;

    this.themeBar.querySelectorAll('.theme-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const themeSlug = pill.getAttribute('data-theme') || null;
        this.filterByTheme(themeSlug);
      });
    });
  }

  static renderPackagesLoading() {
    if (!this.pkgContainer) return;
    this.pkgContainer.innerHTML = Array(3)
      .fill(
        `
      <div class="card skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-content">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-text"></div>
          <div class="skeleton-line skeleton-text" style="width: 60%;"></div>
          <div class="skeleton-line skeleton-btn"></div>
        </div>
      </div>
    `,
      )
      .join('');
  }

  static renderPackagesError(_err) {
    if (!this.pkgContainer) return;
    this.pkgContainer.innerHTML = `
      <div class="catalogue-state-card error-state">
        <span class="state-icon" aria-hidden="true">⚠️</span>
        <h3>Unable to load packages</h3>
        <p>Could not connect to catalogue services. Please try again.</p>
        <button type="button" class="btn-primary" id="retry-packages-btn">Retry</button>
      </div>
    `;
    this.pkgContainer
      .querySelector('#retry-packages-btn')
      ?.addEventListener('click', () => this.loadPackages());
  }

  static renderPackages() {
    if (!this.pkgContainer) return;
    if (this.state.packages.length === 0) {
      this.pkgContainer.innerHTML = `
        <div class="catalogue-state-card empty-state">
          <span class="state-icon" aria-hidden="true">🎒</span>
          <h3>No travel packages found</h3>
          <p>${
            this.currentFilter.destinationSlug || this.currentFilter.themeSlug
              ? 'No packages match the selected filter.'
              : 'Our team is preparing exciting packages for you.'
          }</p>
          ${
            this.currentFilter.destinationSlug || this.currentFilter.themeSlug
              ? '<button type="button" class="btn-secondary" id="clear-filters-btn">Clear Filters</button>'
              : ''
          }
        </div>
      `;
      this.pkgContainer
        .querySelector('#clear-filters-btn')
        ?.addEventListener('click', () => this.clearFilters());
      return;
    }

    this.pkgContainer.innerHTML = this.state.packages.map((p) => renderPackageCard(p)).join('');

    // Attach click listeners to "View Details" buttons and cards
    this.pkgContainer.querySelectorAll('.btn-package-details').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = btn.getAttribute('data-slug');
        this.openPackageDetail(slug);
      });
    });

    this.pkgContainer.querySelectorAll('.package-card').forEach((card) => {
      card.addEventListener('click', () => {
        const slug = card.getAttribute('data-slug');
        this.openPackageDetail(slug);
      });
    });
  }

  static renderFilterStatus() {
    if (!this.filterStatusContainer) return;
    const hasFilter = Boolean(this.currentFilter.destinationSlug || this.currentFilter.themeSlug);

    if (!hasFilter) {
      this.filterStatusContainer.innerHTML = '';
      this.filterStatusContainer.classList.add('hidden');
      return;
    }

    let filterLabel = 'Showing packages';
    if (this.currentFilter.destinationSlug) {
      const dest = this.state.destinations.find(
        (d) => d.slug === this.currentFilter.destinationSlug,
      );
      filterLabel += ` in <strong>${escapeHtml(dest ? dest.cityName : this.currentFilter.destinationSlug)}</strong>`;
    }
    if (this.currentFilter.themeSlug) {
      const theme = this.state.themes.find((t) => t.slug === this.currentFilter.themeSlug);
      filterLabel += ` for theme <strong>${escapeHtml(theme ? theme.title : this.currentFilter.themeSlug)}</strong>`;
    }

    this.filterStatusContainer.innerHTML = `
      <div class="active-filter-banner">
        <span>${filterLabel}</span>
        <button type="button" class="btn-clear-filter" id="btn-banner-clear-filter" aria-label="Clear active filters">&times; Clear</button>
      </div>
    `;
    this.filterStatusContainer.classList.remove('hidden');

    this.filterStatusContainer
      .querySelector('#btn-banner-clear-filter')
      ?.addEventListener('click', () => this.clearFilters());
  }
}
