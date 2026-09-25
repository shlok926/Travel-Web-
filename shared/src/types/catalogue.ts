import { SupportedCurrency } from '../utils/money.js';

export type { SupportedCurrency };

// --- Controlled Enums & Unions ---

export const ACCOMMODATION_TIERS = ['BUDGET', 'STANDARD', 'LUXURY'] as const;
export type AccommodationTier = (typeof ACCOMMODATION_TIERS)[number];

export const MEAL_PLANS = ['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD'] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];

export const DAILY_MEALS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
export type DailyMeal = (typeof DAILY_MEALS)[number];

// --- 1. Destination Contracts ---

export interface DestinationDto {
  id: string;
  slug: string;
  cityName: string;
  country: string;
  description: string;
  thumbnailUrl: string;
  heroImageUrl: string | null;
  isFeatured: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DestinationCardDto {
  id: string;
  slug: string;
  cityName: string;
  country: string;
  description: string;
  thumbnailUrl: string;
  heroImageUrl: string | null;
  isFeatured: boolean;
  isPublished: boolean;
  packagesCount?: number;
}

// --- 2. Tour Theme Contracts ---

export interface ThemeDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  createdAt: string;
}

// --- 3. Itinerary Day Contracts ---

export interface ItineraryDayDto {
  id: string;
  packageId: string;
  dayNumber: number;
  title: string;
  activityDescription: string;
  mealsIncluded: DailyMeal[];
  accommodationNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItineraryDayInputDto {
  dayNumber: number;
  title: string;
  activityDescription: string;
  mealsIncluded?: DailyMeal[];
  accommodationNotes?: string | null;
}

// --- 4. Tour Package Contracts ---

export interface TourPackageDto {
  id: string;
  destinationId: string;
  themeId: string | null;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  durationDays: number;
  durationNights: number;
  originCity: string;
  destinationCity: string;
  baseAdultPrice: number; // Integer minor units (paise/cents)
  baseChildPrice: number; // Integer minor units (paise/cents)
  currency: SupportedCurrency;
  heroImageUrl: string;
  galleryUrls: string[];
  inclusions: string[];
  exclusions: string[];
  accommodationTiers: AccommodationTier[];
  mealPlans: MealPlan[];
  isPublished: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TourPackageCardDto {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  durationDays: number;
  durationNights: number;
  originCity: string;
  destinationCity: string;
  baseAdultPrice: number; // Integer minor units (paise/cents)
  baseChildPrice: number; // Integer minor units (paise/cents)
  currency: SupportedCurrency;
  heroImageUrl: string;
  isPublished: boolean;
  isFeatured: boolean;
  destination: {
    id: string;
    slug: string;
    cityName: string;
    country: string;
  };
  theme: {
    id: string;
    slug: string;
    title: string;
  } | null;
}

export interface TourPackageDetailDto extends TourPackageDto {
  destination: DestinationDto;
  theme: ThemeDto | null;
  itinerary: ItineraryDayDto[];
}

// --- 5. Query Filter Contracts ---

export interface DestinationQueryFilter {
  page?: number;
  limit?: number;
  isFeatured?: boolean;
  isPublished?: boolean;
}

export interface TourPackageQueryFilter {
  page?: number;
  limit?: number;
  destinationSlug?: string;
  themeSlug?: string;
  isFeatured?: boolean;
  isPublished?: boolean;
}
