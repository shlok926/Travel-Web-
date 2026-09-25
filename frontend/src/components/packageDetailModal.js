import { escapeHtml, formatPrice, formatDuration, FALLBACK_IMAGE } from '../utils/formatters.js';

/**
 * Controller for rendering and handling the Package Detail Modal
 */
export class PackageDetailModal {
  static getContainer() {
    return document.getElementById('package-detail-modal');
  }

  /**
   * Open modal and render package details
   * @param {object} pkg - Full TourPackageDetailDto
   */
  static open(pkg) {
    const container = this.getContainer();
    if (!container) return;

    const title = escapeHtml(pkg.title);
    const shortDesc = escapeHtml(pkg.shortDescription);
    const description = escapeHtml(pkg.description);
    const destinationCity = escapeHtml(pkg.destination?.cityName || pkg.destinationCity || 'India');
    const destinationCountry = escapeHtml(pkg.destination?.country || 'India');
    const themeTitle = pkg.theme?.title ? escapeHtml(pkg.theme.title) : null;
    const duration = formatDuration(pkg.durationDays, pkg.durationNights);
    const heroImage = pkg.heroImageUrl ? escapeHtml(pkg.heroImageUrl) : FALLBACK_IMAGE;
    const adultPrice = formatPrice(pkg.baseAdultPrice, pkg.currency);
    const childPrice =
      pkg.baseChildPrice && pkg.baseChildPrice > 0
        ? formatPrice(pkg.baseChildPrice, pkg.currency)
        : null;

    // Gallery images
    const gallery = Array.isArray(pkg.galleryUrls) ? pkg.galleryUrls : [];
    const galleryHtml =
      gallery.length > 0
        ? `
        <div class="detail-section">
          <h4 class="detail-subtitle">Photo Gallery</h4>
          <div class="detail-gallery-grid">
            ${gallery
              .map(
                (url, idx) => `
              <div class="gallery-thumb-container">
                <img
                  src="${escapeHtml(url)}"
                  alt="${title} gallery photo ${idx + 1}"
                  class="gallery-thumb"
                  loading="lazy"
                  onerror="this.onerror=null; this.src='${FALLBACK_IMAGE}';"
                />
              </div>
            `,
              )
              .join('')}
          </div>
        </div>
      `
        : '';

    // Inclusions
    const inclusions = Array.isArray(pkg.inclusions) ? pkg.inclusions : [];
    const inclusionsHtml =
      inclusions.length > 0
        ? `
        <div class="detail-feature-col">
          <h4 class="detail-subtitle"><span class="icon-check" aria-hidden="true">✓</span> Inclusions</h4>
          <ul class="detail-list inclusion-list">
            ${inclusions.map((item) => `<li><span class="bullet-check">✓</span> ${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `
        : '';

    // Exclusions
    const exclusions = Array.isArray(pkg.exclusions) ? pkg.exclusions : [];
    const exclusionsHtml =
      exclusions.length > 0
        ? `
        <div class="detail-feature-col">
          <h4 class="detail-subtitle"><span class="icon-cross" aria-hidden="true">✕</span> Exclusions</h4>
          <ul class="detail-list exclusion-list">
            ${exclusions.map((item) => `<li><span class="bullet-cross">✕</span> ${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `
        : '';

    // Accommodation Tiers & Meal Plans
    const tiers = Array.isArray(pkg.accommodationTiers) ? pkg.accommodationTiers : [];
    const mealPlans = Array.isArray(pkg.mealPlans) ? pkg.mealPlans : [];

    const accommodationHtml =
      tiers.length > 0 || mealPlans.length > 0
        ? `
        <div class="detail-section detail-amenities-section">
          ${
            tiers.length > 0
              ? `
            <div class="amenity-group">
              <span class="amenity-label">Accommodation Tiers:</span>
              <div class="chip-group">
                ${tiers.map((t) => `<span class="chip chip-tier">${escapeHtml(t)}</span>`).join('')}
              </div>
            </div>
          `
              : ''
          }
          ${
            mealPlans.length > 0
              ? `
            <div class="amenity-group">
              <span class="amenity-label">Meal Plans:</span>
              <div class="chip-group">
                ${mealPlans.map((m) => `<span class="chip chip-meal">${escapeHtml(m)}</span>`).join('')}
              </div>
            </div>
          `
              : ''
          }
        </div>
      `
        : '';

    // Day-by-day Itinerary
    const itinerary = Array.isArray(pkg.itinerary) ? pkg.itinerary : [];
    const itineraryHtml =
      itinerary.length > 0
        ? `
        <div class="detail-section detail-itinerary-section">
          <h4 class="detail-subtitle">Day-by-Day Itinerary</h4>
          <div class="itinerary-timeline">
            ${itinerary
              .map(
                (day) => `
              <div class="itinerary-day-item">
                <div class="day-number-badge">Day ${escapeHtml(day.dayNumber)}</div>
                <div class="day-content">
                  <h5 class="day-title">${escapeHtml(day.title)}</h5>
                  <p class="day-activity">${escapeHtml(day.activityDescription)}</p>
                  ${
                    Array.isArray(day.mealsIncluded) && day.mealsIncluded.length > 0
                      ? `
                    <div class="day-meta">
                      <span class="day-meals-label">Meals:</span>
                      ${day.mealsIncluded.map((meal) => `<span class="chip chip-sm">${escapeHtml(meal)}</span>`).join(' ')}
                    </div>
                  `
                      : ''
                  }
                  ${
                    day.accommodationNotes
                      ? `
                    <div class="day-notes">
                      <span class="notes-icon" aria-hidden="true">🏨</span>
                      <span>${escapeHtml(day.accommodationNotes)}</span>
                    </div>
                  `
                      : ''
                  }
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        </div>
      `
        : `
        <div class="detail-section">
          <p class="text-muted">Itinerary details will be updated soon.</p>
        </div>
      `;

    container.innerHTML = `
      <div class="modal-card detail-modal-card" role="document">
        <button type="button" class="modal-close-btn" id="package-modal-close" aria-label="Close package details">&times;</button>
        
        <div class="detail-header-banner" style="background-image: url('${heroImage}');">
          <div class="banner-overlay"></div>
          <div class="banner-content">
            <div class="banner-badges">
              <span class="badge badge-duration">⏱️ ${duration}</span>
              ${themeTitle ? `<span class="badge badge-theme">${themeTitle}</span>` : ''}
              <span class="badge badge-location">📍 ${destinationCity}, ${destinationCountry}</span>
            </div>
            <h2 class="detail-title">${title}</h2>
            <p class="detail-short-desc">${shortDesc}</p>
          </div>
        </div>

        <div class="detail-modal-body">
          <div class="detail-pricing-box">
            <div class="pricing-col">
              <span class="pricing-label">Adult Price</span>
              <span class="pricing-amount">${adultPrice}</span>
              <span class="pricing-subtext">per person (twin sharing)</span>
            </div>
            ${
              childPrice
                ? `
              <div class="pricing-col">
                <span class="pricing-label">Child Price</span>
                <span class="pricing-amount">${childPrice}</span>
                <span class="pricing-subtext">per child</span>
              </div>
            `
                : ''
            }
          </div>

          <div class="detail-section">
            <h4 class="detail-subtitle">Tour Overview</h4>
            <p class="detail-full-description">${description}</p>
          </div>

          ${galleryHtml}
          ${accommodationHtml}

          ${
            inclusionsHtml || exclusionsHtml
              ? `
            <div class="detail-section detail-grid-2col">
              ${inclusionsHtml}
              ${exclusionsHtml}
            </div>
          `
              : ''
          }

          ${itineraryHtml}
        </div>
      </div>
    `;

    container.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Event listeners
    const closeBtn = container.querySelector('#package-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Close on backdrop click
    container.onclick = (e) => {
      if (e.target === container) {
        this.close();
      }
    };

    // Close on Escape
    this.escListener = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    window.addEventListener('keydown', this.escListener);
  }

  static close() {
    const container = this.getContainer();
    if (!container) return;
    container.classList.add('hidden');
    container.innerHTML = '';
    document.body.style.overflow = '';
    if (this.escListener) {
      window.removeEventListener('keydown', this.escListener);
      this.escListener = null;
    }
  }
}
