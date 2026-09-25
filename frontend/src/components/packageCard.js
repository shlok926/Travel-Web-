import { escapeHtml, formatPrice, formatDuration, FALLBACK_IMAGE } from '../utils/formatters.js';

/**
 * Render a Tour Package Card HTML template
 * @param {object} pkg - PackageSearchResultDto | TourPackageCardDto
 * @returns {string} HTML string
 */
export function renderPackageCard(pkg) {
  const title = escapeHtml(pkg.title);
  const slug = escapeHtml(pkg.slug);
  const shortDescription = escapeHtml(pkg.shortDescription);
  const destinationCity = escapeHtml(pkg.destination?.cityName || pkg.destinationCity || 'India');
  const themeTitle = pkg.theme?.title ? escapeHtml(pkg.theme.title) : null;
  const imageUrl = pkg.heroImageUrl ? escapeHtml(pkg.heroImageUrl) : FALLBACK_IMAGE;
  const duration = formatDuration(pkg.durationDays, pkg.durationNights);
  const isFeatured = Boolean(pkg.isFeatured);

  // Next departure availability metadata (Phase 4)
  const nextDep = pkg.nextDeparture;
  let departureBadgeHtml = '';
  let effectivePrice = pkg.baseAdultPrice;
  const currency = nextDep?.currency || pkg.currency || 'INR';

  if (nextDep) {
    effectivePrice = nextDep.effectiveAdultPrice || pkg.baseAdultPrice;
    const depDate = escapeHtml(nextDep.departureDate);
    const availSeats = Number(nextDep.availableSeats ?? 0);

    let statusBadgeClass = 'badge-available';
    let statusText = 'Available';

    if (nextDep.availabilityStatus === 'FEW_SEATS_LEFT') {
      statusBadgeClass = 'badge-few-seats';
      statusText = `Only ${availSeats} Left!`;
    } else if (nextDep.availabilityStatus === 'SOLD_OUT') {
      statusBadgeClass = 'badge-sold-out';
      statusText = 'Sold Out';
    } else if (nextDep.availabilityStatus === 'CLOSED') {
      statusBadgeClass = 'badge-closed';
      statusText = 'Closed';
    } else if (nextDep.availabilityStatus === 'CANCELLED') {
      statusBadgeClass = 'badge-cancelled';
      statusText = 'Cancelled';
    }

    departureBadgeHtml = `
      <div class="card-next-departure">
        <span class="next-dep-date">📅 Next: ${depDate}</span>
        <span class="badge ${statusBadgeClass}">${statusText}</span>
      </div>
    `;
  }

  const formattedPrice = formatPrice(effectivePrice, currency);

  return `
    <article class="card package-card" data-slug="${slug}">
      <div class="card-img-container">
        <img
          src="${imageUrl}"
          alt="${title}"
          class="card-img"
          loading="lazy"
          onerror="this.onerror=null; this.src='${FALLBACK_IMAGE}';"
        />
        <div class="card-badges">
          ${isFeatured ? '<span class="badge badge-featured">Featured</span>' : ''}
          ${themeTitle ? `<span class="badge badge-theme">${themeTitle}</span>` : ''}
        </div>
        <div class="card-duration-chip">
          <span>⏱️ ${duration}</span>
        </div>
      </div>
      <div class="card-content">
        <div class="card-location">
          <span class="location-icon" aria-hidden="true">📍</span>
          <span class="location-text">${destinationCity}</span>
        </div>
        <h3 class="card-title">${title}</h3>
        <p class="card-description">${shortDescription}</p>
        
        ${departureBadgeHtml}

        <div class="card-footer">
          <div class="card-price-block">
            <span class="price-label">Starting from</span>
            <span class="price-value">${formattedPrice}</span>
            <span class="price-unit">/ person</span>
          </div>
          <button type="button" class="btn-primary btn-package-details" data-slug="${slug}" aria-label="View details for ${title}">
            View Details
          </button>
        </div>
      </div>
    </article>
  `;
}
