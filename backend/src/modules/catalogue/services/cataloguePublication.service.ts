import { ErrorDetail } from '../../../../../shared/src/index.js';
import { DestinationEntity } from '../repositories/destination.repository.js';
import { TourPackageEntity } from '../repositories/tourPackage.repository.js';
import { ItineraryDayEntity } from '../repositories/itinerary.repository.js';

export interface PublicationCheckResult {
  isEligible: boolean;
  issues: ErrorDetail[];
}

export class CataloguePublicationService {
  /**
   * Evaluates BR-PKG-001 Publication Completeness Invariant.
   *
   * A package cannot be marked published unless it contains:
   * 1. A valid title (min 3 characters)
   * 2. A valid slug
   * 3. A valid duration (> 0 days)
   * 4. A positive adult price (> 0 minor units)
   * 5. A valid banner / hero image URL
   * 6. At least one day-wise itinerary entry (itinerary >= 1)
   * 7. The referenced destination must be an active, published destination
   */
  static validatePackagePublication(
    pkg: TourPackageEntity,
    destination: DestinationEntity | null,
    itineraryDays: ItineraryDayEntity[],
  ): PublicationCheckResult {
    const issues: ErrorDetail[] = [];

    // 1. Title completeness
    if (!pkg.title || pkg.title.trim().length < 3) {
      issues.push({
        field: 'title',
        issue: 'Package title is missing or less than 3 characters.',
      });
    }

    // 2. Slug completeness
    if (!pkg.slug || pkg.slug.trim().length < 3) {
      issues.push({
        field: 'slug',
        issue: 'Package slug is missing or invalid.',
      });
    }

    // 3. Duration completeness
    if (!pkg.durationDays || pkg.durationDays <= 0) {
      issues.push({
        field: 'durationDays',
        issue: 'Package duration must be at least 1 day.',
      });
    }

    // 4. Base Adult Price completeness (must be positive minor units)
    if (!pkg.baseAdultPrice || pkg.baseAdultPrice <= 0) {
      issues.push({
        field: 'baseAdultPrice',
        issue: 'Package base adult price must be greater than zero for publication.',
      });
    }

    // 5. Hero Image completeness
    if (!pkg.heroImageUrl || pkg.heroImageUrl.trim().length === 0) {
      issues.push({
        field: 'heroImageUrl',
        issue: 'Package hero image URL is required for publication.',
      });
    }

    // 6. Destination validity & publication status
    if (!destination) {
      issues.push({
        field: 'destinationId',
        issue: 'Referenced destination does not exist.',
      });
    } else if (!destination.isPublished) {
      issues.push({
        field: 'destinationId',
        issue: `Referenced destination '${destination.cityName}' is not published. Packages cannot be published under an unpublished destination.`,
      });
    }

    // 7. Day-wise Itinerary completeness (strictly >= 1 day)
    if (!itineraryDays || itineraryDays.length === 0) {
      issues.push({
        field: 'itinerary',
        issue: 'Package must have at least one day-wise itinerary entry before publication.',
      });
    }

    return {
      isEligible: issues.length === 0,
      issues,
    };
  }
}
