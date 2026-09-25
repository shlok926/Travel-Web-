import { api } from '../api/client.js';
import { renderDestinationCard } from './destinationCard.js';
import { renderPackageCard } from './packageCard.js';
import { PackageDetailModal } from './packageDetailModal.js';
import { escapeHtml } from '../utils/formatters.js';

/**
 * Orchestrator component for Dynamic Catalogue & Phase 4 Search Experience
 */
export class CatalogueSection {
  /**
   * @type {{
   *   filters: {
   *     q: string;
   *     destinationSlug: string | null;
   *     themeSlug: string | null;
   *     minDuration: number | null;
   *     maxDuration: number | null;
   *     maxPrice: number | null;
   *     sortBy: string | null;
   *     page: number;
   *     limit: number;
   *   };
   *   destinations: any[];
   *   themes: any[];
   *   packages: any[];
   *   pagination: {
   *     page: number;
   *     limit: number;
   *     total: number;
   *     totalPages: number;
   *     hasNextPage: boolean;
   *     hasPrevPage: boolean;
   *   };
   *   loadingDestinations: boolean;
   *   loadingPackages: boolean;
   *   errorDestinations: any;
   *   errorPackages: any;
   * }}
   */
  static state = {
    filters: {
      q: '',
      destinationSlug: null,
      themeSlug: null,
      minDuration: null,
      maxDuration: null,
      maxPrice: null,
      sortBy: null,
      page: 1,
      limit: 12,
    },
    destinations: [],
    themes: [],
    packages: [],
    pagination: {
      page: 1,
      limit: 12,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    },
    loadingDestinations: false,
    loadingPackages: false,
    errorDestinations: null,
    errorPackages: null,
  };

  // Stale request protection & debounce timers
  static latestRequestId = 0;
  static searchDebounceTimer = null;
  static currentAbortController = null;

  static async init() {
    this.destContainer = document.getElementById('destinations-grid');
    this.pkgContainer = document.getElementById('packages-grid');
    this.themeBar = document.getElementById('theme-filter-bar');
    this.filterStatusContainer = document.getElementById('catalogue-filter-status');
    this.paginationContainer = document.getElementById('packages-pagination');

    // Filter controls
    this.filterSearchInput = document.getElementById('filter-search-input');
    this.filterDestSelect = document.getElementById('filter-destination-select');
    this.filterDurationSelect = document.getElementById('filter-duration-select');
    this.filterPriceSelect = document.getElementById('filter-price-select');
    this.filterSortSelect = document.getElementById('filter-sort-select');
    this.filterResetBtn = document.getElementById('filter-reset-btn');

    // Attach search input listener from Hero section
    const heroSearchInput = document.getElementById('search-input');
    const heroSearchBtn = document.getElementById('search-btn');
    if (heroSearchBtn && heroSearchInput) {
      const handleHeroSearch = () => {
        const query = heroSearchInput.value.trim();
        if (this.filterSearchInput) {
          this.filterSearchInput.value = query;
        }
        this.state.filters.q = query;
        this.state.filters.page = 1;
        this.loadPackages();

        const pkgSection = document.getElementById('packages');
        if (pkgSection) {
          pkgSection.scrollIntoView({ behavior: 'smooth' });
        }
      };

      heroSearchBtn.addEventListener('click', handleHeroSearch);
      heroSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleHeroSearch();
        }
      });
    }

    // Attach search & filter toolbar listeners
    if (this.filterSearchInput) {
      this.filterSearchInput.addEventListener('input', () => {
        if (this.searchDebounceTimer) {
          clearTimeout(this.searchDebounceTimer);
        }
        this.searchDebounceTimer = setTimeout(() => {
          this.state.filters.q = this.filterSearchInput.value.trim();
          this.state.filters.page = 1;
          this.loadPackages();
        }, 300);
      });
    }

    if (this.filterDestSelect) {
      this.filterDestSelect.addEventListener('change', () => {
        this.state.filters.destinationSlug = this.filterDestSelect.value || null;
        this.state.filters.page = 1;
        this.loadPackages();
      });
    }

    if (this.filterDurationSelect) {
      this.filterDurationSelect.addEventListener('change', () => {
        const val = this.filterDurationSelect.value;
        if (!val) {
          this.state.filters.minDuration = null;
          this.state.filters.maxDuration = null;
        } else {
          const [min, max] = val.split('-').map(Number);
          this.state.filters.minDuration = min || null;
          this.state.filters.maxDuration = max || null;
        }
        this.state.filters.page = 1;
        this.loadPackages();
      });
    }

    if (this.filterPriceSelect) {
      this.filterPriceSelect.addEventListener('change', () => {
        const val = this.filterPriceSelect.value;
        this.state.filters.maxPrice = val ? Number(val) : null;
        this.state.filters.page = 1;
        this.loadPackages();
      });
    }

    if (this.filterSortSelect) {
      this.filterSortSelect.addEventListener('change', () => {
        this.state.filters.sortBy = this.filterSortSelect.value || null;
        this.state.filters.page = 1;
        this.loadPackages();
      });
    }

    if (this.filterResetBtn) {
      this.filterResetBtn.addEventListener('click', () => {
        this.resetFilters();
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
      this.populateDestinationSelect();
      this.renderDestinations();
    } catch (err) {
      this.state.errorDestinations = err;
      this.renderDestinationsError(err);
    } finally {
      this.state.loadingDestinations = false;
    }
  }

  /**
   * Populate destination dropdown options
   */
  static populateDestinationSelect() {
    if (!this.filterDestSelect) return;
    const currentVal = this.state.filters.destinationSlug || '';
    const options = [
      '<option value="">All Destinations</option>',
      ...this.state.destinations.map(
        (d) =>
          `<option value="${escapeHtml(d.slug)}"${d.slug === currentVal ? ' selected' : ''}>${escapeHtml(d.cityName)}, ${escapeHtml(d.country)}</option>`,
      ),
    ];
    this.filterDestSelect.innerHTML = options.join('');
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
   * Load tour packages using Phase 4 Search API with active filters, sorting, and pagination
   */
  static async loadPackages() {
    if (!this.pkgContainer) return;

    // Stale request race condition protection
    const requestId = ++this.latestRequestId;

    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch {
        // ignore
      }
    }
    this.currentAbortController =
      typeof AbortController !== 'undefined' ? new AbortController() : null;

    this.state.loadingPackages = true;
    this.state.errorPackages = null;
    this.renderPackagesLoading();
    this.renderFilterStatus();

    try {
      const cleanParams = {};
      if (this.state.filters.q) cleanParams.q = this.state.filters.q;
      if (this.state.filters.destinationSlug)
        cleanParams.destinationSlug = this.state.filters.destinationSlug;
      if (this.state.filters.themeSlug) cleanParams.themeSlug = this.state.filters.themeSlug;
      if (this.state.filters.minDuration) cleanParams.minDuration = this.state.filters.minDuration;
      if (this.state.filters.maxDuration) cleanParams.maxDuration = this.state.filters.maxDuration;
      if (this.state.filters.maxPrice) cleanParams.maxPrice = this.state.filters.maxPrice;
      if (this.state.filters.sortBy) cleanParams.sortBy = this.state.filters.sortBy;
      cleanParams.page = this.state.filters.page || 1;
      cleanParams.limit = this.state.filters.limit || 12;

      const result = await api.searchPackages(cleanParams, {
        signal: this.currentAbortController?.signal,
      });

      // Ignore stale response if a newer search request was initiated
      if (requestId !== this.latestRequestId) {
        return;
      }

      this.state.packages = Array.isArray(result?.items) ? result.items : [];
      this.state.pagination = result.pagination || {
        page: cleanParams.page,
        limit: cleanParams.limit,
        total: this.state.packages.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };

      this.renderPackages();
      this.renderPagination();
      this.renderFilterStatus();
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      if (requestId !== this.latestRequestId) {
        return;
      }
      this.state.errorPackages = err;
      this.renderPackagesError(err);
      if (this.paginationContainer) {
        this.paginationContainer.innerHTML = '';
        this.paginationContainer.classList.add('hidden');
      }
    } finally {
      if (requestId === this.latestRequestId) {
        this.state.loadingPackages = false;
      }
    }
  }

  /**
   * Filter packages by Destination Slug
   * @param {string|null} destinationSlug
   */
  static filterByDestination(destinationSlug) {
    this.state.filters.destinationSlug = destinationSlug;
    this.state.filters.page = 1;
    if (this.filterDestSelect) {
      this.filterDestSelect.value = destinationSlug || '';
    }
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
    this.state.filters.themeSlug = themeSlug;
    this.state.filters.page = 1;
    this.renderThemes();
    this.loadPackages();
  }

  /**
   * Change pagination page
   * @param {number} newPage
   */
  static goToPage(newPage) {
    if (newPage < 1) return;
    this.state.filters.page = newPage;
    this.loadPackages();
    const pkgSection = document.getElementById('packages');
    if (pkgSection) {
      pkgSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /**
   * Reset all search and filter controls to default
   */
  static resetFilters() {
    this.state.filters = {
      q: '',
      destinationSlug: null,
      themeSlug: null,
      minDuration: null,
      maxDuration: null,
      maxPrice: null,
      sortBy: null,
      page: 1,
      limit: 12,
    };

    if (this.filterSearchInput) this.filterSearchInput.value = '';
    if (this.filterDestSelect) this.filterDestSelect.value = '';
    if (this.filterDurationSelect) this.filterDurationSelect.value = '';
    if (this.filterPriceSelect) this.filterPriceSelect.value = '';
    if (this.filterSortSelect) this.filterSortSelect.value = '';

    const heroInput = document.getElementById('search-input');
    if (heroInput) heroInput.value = '';

    this.renderThemes();
    this.loadPackages();
  }

  /**
   * Backward-compatible alias for clearing filters
   */
  static clearFilters() {
    this.resetFilters();
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

    const allActive = !this.state.filters.themeSlug;

    this.themeBar.innerHTML = `
      <button type="button" class="theme-pill ${allActive ? 'active' : ''}" data-theme="">
        All Themes
      </button>
      ${this.state.themes
        .map((t) => {
          const isActive = this.state.filters.themeSlug === t.slug;
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

  static renderPackagesError(err) {
    if (!this.pkgContainer) return;
    const userSafeMessage =
      err?.message || 'Could not connect to catalogue services. Please try again.';
    this.pkgContainer.innerHTML = `
      <div class="catalogue-state-card error-state">
        <span class="state-icon" aria-hidden="true">⚠️</span>
        <h3>Unable to load packages</h3>
        <p>${escapeHtml(userSafeMessage)}</p>
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
          <h3>No tour packages found</h3>
          <p>We couldn't find any tour packages matching your search criteria. Try adjusting your filters.</p>
          <button type="button" class="btn-primary" id="empty-state-reset-btn">Reset All Filters</button>
        </div>
      `;
      this.pkgContainer
        .querySelector('#empty-state-reset-btn')
        ?.addEventListener('click', () => this.resetFilters());
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

  static renderPagination() {
    if (!this.paginationContainer) return;

    const { page, totalPages, total, hasPrevPage, hasNextPage } = this.state.pagination;

    if (!totalPages || totalPages <= 1) {
      this.paginationContainer.innerHTML = '';
      this.paginationContainer.classList.add('hidden');
      return;
    }

    let pagesHtml = '';
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    for (let p = startPage; p <= endPage; p++) {
      pagesHtml += `
        <button
          type="button"
          class="pagination-page-btn ${p === page ? 'active' : ''}"
          data-page="${p}"
          aria-label="Go to page ${p}"
          ${p === page ? 'aria-current="page"' : ''}
        >
          ${p}
        </button>
      `;
    }

    this.paginationContainer.innerHTML = `
      <div class="pagination-wrapper">
        <div class="pagination-info">
          Showing page <strong>${page}</strong> of <strong>${totalPages}</strong> (${total} total packages)
        </div>
        <div class="pagination-controls">
          <button
            type="button"
            class="pagination-nav-btn btn-prev"
            id="pagination-prev-btn"
            ${!hasPrevPage ? 'disabled' : ''}
            aria-label="Previous page"
          >
            &larr; Previous
          </button>
          <div class="pagination-pages">
            ${pagesHtml}
          </div>
          <button
            type="button"
            class="pagination-nav-btn btn-next"
            id="pagination-next-btn"
            ${!hasNextPage ? 'disabled' : ''}
            aria-label="Next page"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    `;

    this.paginationContainer.classList.remove('hidden');

    // Attach listeners
    this.paginationContainer
      .querySelector('#pagination-prev-btn')
      ?.addEventListener('click', () => {
        if (hasPrevPage) {
          this.goToPage(page - 1);
        }
      });

    this.paginationContainer
      .querySelector('#pagination-next-btn')
      ?.addEventListener('click', () => {
        if (hasNextPage) {
          this.goToPage(page + 1);
        }
      });

    this.paginationContainer.querySelectorAll('.pagination-page-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetPage = Number(btn.getAttribute('data-page'));
        if (targetPage && targetPage !== page) {
          this.goToPage(targetPage);
        }
      });
    });
  }

  static renderFilterStatus() {
    if (!this.filterStatusContainer) return;

    const f = this.state.filters;
    const activeFilters = [];

    if (f.q) {
      activeFilters.push(`Keyword: "<strong>${escapeHtml(f.q)}</strong>"`);
    }

    if (f.destinationSlug) {
      const dest = this.state.destinations.find((d) => d.slug === f.destinationSlug);
      const label = dest ? dest.cityName : f.destinationSlug;
      activeFilters.push(`Destination: <strong>${escapeHtml(label)}</strong>`);
    }

    if (f.themeSlug) {
      const theme = this.state.themes.find((t) => t.slug === f.themeSlug);
      const label = theme ? theme.title : f.themeSlug;
      activeFilters.push(`Theme: <strong>${escapeHtml(label)}</strong>`);
    }

    if (f.minDuration || f.maxDuration) {
      const durLabel = f.maxDuration
        ? `${f.minDuration || 1} - ${f.maxDuration} Days`
        : `${f.minDuration}+ Days`;
      activeFilters.push(`Duration: <strong>${escapeHtml(durLabel)}</strong>`);
    }

    if (f.maxPrice) {
      const priceFormatted = (f.maxPrice / 100).toLocaleString('en-IN');
      activeFilters.push(`Budget: <strong>Under ₹${priceFormatted}</strong>`);
    }

    if (f.sortBy) {
      const sortLabels = {
        price_asc: 'Price: Low to High',
        price_desc: 'Price: High to Low',
        duration_asc: 'Duration: Short to Long',
        duration_desc: 'Duration: Long to Short',
        newest: 'Newest First',
        featured: 'Featured First',
      };
      activeFilters.push(`Sort: <strong>${escapeHtml(sortLabels[f.sortBy] || f.sortBy)}</strong>`);
    }

    if (activeFilters.length === 0) {
      this.filterStatusContainer.innerHTML = '';
      this.filterStatusContainer.classList.add('hidden');
      return;
    }

    this.filterStatusContainer.innerHTML = `
      <div class="active-filter-banner">
        <div class="active-filter-labels">
          <span class="active-filter-title">Active Filters:</span>
          ${activeFilters.join(' • ')}
        </div>
        <button type="button" class="btn-clear-filter" id="btn-banner-clear-filter" aria-label="Clear active filters">&times; Clear All</button>
      </div>
    `;
    this.filterStatusContainer.classList.remove('hidden');

    this.filterStatusContainer
      .querySelector('#btn-banner-clear-filter')
      ?.addEventListener('click', () => this.resetFilters());
  }
}
