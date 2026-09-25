import { escapeHtml, FALLBACK_IMAGE } from '../utils/formatters.js';

/**
 * Render a Destination Card HTML template
 * @param {object} destination - Destination DTO
 * @returns {string} HTML string
 */
export function renderDestinationCard(destination) {
  const city = escapeHtml(destination.cityName);
  const country = escapeHtml(destination.country);
  const description = escapeHtml(destination.description);
  const slug = escapeHtml(destination.slug);
  const imageUrl = destination.thumbnailUrl ? escapeHtml(destination.thumbnailUrl) : FALLBACK_IMAGE;
  const isFeatured = Boolean(destination.isFeatured);

  return `
    <article class="card destination-card" data-slug="${slug}" tabindex="0" role="button" aria-label="Explore packages in ${city}, ${country}">
      <div class="card-img-container">
        <img
          src="${imageUrl}"
          alt="${city}, ${country}"
          class="card-img"
          loading="lazy"
          onerror="this.onerror=null; this.src='${FALLBACK_IMAGE}';"
        />
        ${isFeatured ? '<span class="badge badge-featured">Featured</span>' : ''}
      </div>
      <div class="card-content">
        <div class="card-location">
          <span class="location-icon" aria-hidden="true">📍</span>
          <span class="location-country">${country}</span>
        </div>
        <h3 class="card-title">${city}</h3>
        <p class="card-description">${description}</p>
        <button type="button" class="btn-secondary btn-destination-select" data-slug="${slug}">
          Explore Packages &rarr;
        </button>
      </div>
    </article>
  `;
}
