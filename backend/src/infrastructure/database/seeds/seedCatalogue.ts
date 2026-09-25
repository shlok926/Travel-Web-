import type pg from 'pg';
import { DatabaseService } from '../index.js';
import { loadEnv } from '../../../config/env.js';
import {
  AccommodationTier,
  MealPlan,
  DailyMeal,
  SupportedCurrency,
} from '../../../../../shared/src/index.js';
import { CataloguePublicationService } from '../../../modules/catalogue/services/cataloguePublication.service.js';

export interface SeedThemeItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string;
}

export interface SeedDestinationItem {
  id: string;
  slug: string;
  cityName: string;
  country: string;
  description: string;
  thumbnailUrl: string;
  heroImageUrl: string;
  isFeatured: boolean;
  isPublished: boolean;
}

export interface SeedItineraryItem {
  id: string;
  dayNumber: number;
  title: string;
  activityDescription: string;
  mealsIncluded: DailyMeal[];
  accommodationNotes: string;
}

export interface SeedPackageItem {
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
  baseAdultPrice: number; // Integer minor units (e.g., 4500000 = ₹45,000)
  baseChildPrice: number; // Integer minor units (e.g., 2500000 = ₹25,000)
  currency: SupportedCurrency;
  heroImageUrl: string;
  galleryUrls: string[];
  inclusions: string[];
  exclusions: string[];
  accommodationTiers: AccommodationTier[];
  mealPlans: MealPlan[];
  isPublished: boolean;
  isFeatured: boolean;
  itineraries: SeedItineraryItem[];
}

export interface CatalogueSeedCounts {
  inserted: number;
  updated: number;
}

export interface CatalogueSeedResult {
  themes: CatalogueSeedCounts;
  destinations: CatalogueSeedCounts;
  packages: CatalogueSeedCounts;
  itineraries: CatalogueSeedCounts;
}

// ============================================================================
// DETERMINISTIC SEED DATASET DEFINITION
// ============================================================================

export const SEED_THEMES: SeedThemeItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111001',
    slug: 'adventure',
    title: 'Adventure & Trekking',
    description:
      'Thrilling outdoor expeditions, high-altitude alpine passes, rafting, and off-road trails.',
    iconUrl:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: '11111111-1111-4111-8111-111111111002',
    slug: 'honeymoon',
    title: 'Honeymoon & Romance',
    description:
      'Romantic escapes with private candle-lit dinners, scenic mountain vistas, and boutique resorts.',
    iconUrl:
      'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: '11111111-1111-4111-8111-111111111003',
    slug: 'heritage',
    title: 'Heritage & Culture',
    description:
      'Centuries-old royal palaces, UNESCO world heritage landmarks, and vibrant regional folk culture.',
    iconUrl:
      'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: '11111111-1111-4111-8111-111111111004',
    slug: 'wildlife',
    title: 'Wildlife & Nature',
    description:
      'Lush national parks, jungle safaris, bird sanctuaries, and untamed biodiversity reserves.',
    iconUrl:
      'https://images.unsplash.com/photo-1534177616072-ef7dc120449d?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: '11111111-1111-4111-8111-111111111005',
    slug: 'beach',
    title: 'Beach & Island',
    description:
      'Sun-drenched tropical shorelines, azure lagoons, water sports, and tranquil seaside retreats.',
    iconUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: '11111111-1111-4111-8111-111111111006',
    slug: 'family',
    title: 'Family Vacations',
    description:
      'Curated relaxing itineraries featuring comfortable pacing, kid-friendly excursions, and family suites.',
    iconUrl:
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=200&auto=format&fit=crop&q=80',
  },
  {
    id: '11111111-1111-4111-8111-111111111007',
    slug: 'luxury',
    title: 'Luxury & Wellness',
    description:
      'Five-star palace hotels, bespoke concierge services, Ayurvedic spa rituals, and gourmet dining.',
    iconUrl:
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=200&auto=format&fit=crop&q=80',
  },
];

export const SEED_DESTINATIONS: SeedDestinationItem[] = [
  {
    id: '22222222-2222-4222-8222-222222222001',
    slug: 'kashmir-valley',
    cityName: 'Srinagar',
    country: 'India',
    description:
      'The crown jewel of northern India, renowned for serene Dal Lake houseboats, snow-clad Pir Panjal ranges, and Mughal gardens.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=1600&auto=format&fit=crop&q=80',
    isFeatured: true,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222002',
    slug: 'kerala-backwaters',
    cityName: 'Alleppey',
    country: 'India',
    description:
      "God's Own Country blessed with palm-fringed canals, Ayurvedic wellness retreats, tea plantations in Munnar, and peaceful backwaters.",
    thumbnailUrl:
      'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1600&auto=format&fit=crop&q=80',
    isFeatured: true,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222003',
    slug: 'golden-triangle-jaipur',
    cityName: 'Jaipur',
    country: 'India',
    description:
      'The iconic Pink City boasting majestic Amber Fort, Hawa Mahal, royal Rajput heritage, and vibrant artisan bazaars.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=1600&auto=format&fit=crop&q=80',
    isFeatured: true,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222004',
    slug: 'goa-coastal',
    cityName: 'Panaji',
    country: 'India',
    description:
      'Golden sand beaches, Portuguese colonial architecture, world-famous coastal cuisine, and vibrant seaside nightlife.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1600&auto=format&fit=crop&q=80',
    isFeatured: true,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222005',
    slug: 'ladakh-himalayas',
    cityName: 'Leh',
    country: 'India',
    description:
      'The land of high mountain passes, Buddhist monasteries perched on cliffs, crystal-blue Pangong Lake, and dramatic moonscapes.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=1600&auto=format&fit=crop&q=80',
    isFeatured: false,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222006',
    slug: 'himachal-heights',
    cityName: 'Manali',
    country: 'India',
    description:
      'Pine-forested valleys, Solang Valley adventure sports, hot sulphur springs, and breathtaking views of the Dhauladhar range.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1600&auto=format&fit=crop&q=80',
    isFeatured: false,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222007',
    slug: 'andaman-islands',
    cityName: 'Port Blair',
    country: 'India',
    description:
      'Pristine archipelago with turquoise waters, world-class scuba diving at Havelock Island, and historic Cellular Jail memorials.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=1600&auto=format&fit=crop&q=80',
    isFeatured: false,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222008',
    slug: 'dubai-emirates',
    cityName: 'Dubai',
    country: 'United Arab Emirates',
    description:
      'Futuristic metropolis boasting Burj Khalifa, ultra-luxury shopping malls, thrilling desert dune bashing, and Marina cruises.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1600&auto=format&fit=crop&q=80',
    isFeatured: true,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222009',
    slug: 'bali-indonesia',
    cityName: 'Denpasar',
    country: 'Indonesia',
    description:
      'Island of the Gods featuring lush emerald Ubud rice terraces, cliffside Uluwatu sunset temples, and vibrant coastal beaches.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1600&auto=format&fit=crop&q=80',
    isFeatured: false,
    isPublished: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222010',
    slug: 'paris-france',
    cityName: 'Paris',
    country: 'France',
    description:
      'The City of Light known for the Eiffel Tower, world-class Louvre art collections, romantic Seine river cruises, and haute cuisine.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&auto=format&fit=crop&q=80',
    heroImageUrl:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1600&auto=format&fit=crop&q=80',
    isFeatured: false,
    isPublished: true,
  },
];

export const SEED_PACKAGES: SeedPackageItem[] = [
  // 1. Kashmir Valley - Honeymoon (INR)
  {
    id: '33333333-3333-4333-8333-333333333001',
    destinationId: '22222222-2222-4222-8222-222222222001',
    themeId: '11111111-1111-4111-8111-111111111002', // Honeymoon
    slug: 'magical-kashmir-paradise',
    title: 'Magical Kashmir Romance & Houseboat Experience',
    shortDescription:
      'Experience 6 days of fairytale romantic bliss in Srinagar, Gulmarg, and Pahalgam with premium houseboat stays.',
    description:
      'Immerse in the breathtaking landscapes of Kashmir. Enjoy Shikara rides on Dal Lake, stay in a heritage cedarwood houseboat, ascend the Gulmarg Gondola to snow-clad peaks, and wander through the pine meadows of Betaab Valley in Pahalgam.',
    durationDays: 6,
    durationNights: 5,
    originCity: 'New Delhi',
    destinationCity: 'Srinagar',
    baseAdultPrice: 4250000, // ₹42,500
    baseChildPrice: 2400000, // ₹24,000
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1566837945700-30057527ade0?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1597074866923-dc0589150358?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '5 Nights accommodation (1N Deluxe Houseboat, 2N Gulmarg Resort, 2N Pahalgam Hotel)',
      'Daily gourmet breakfast and multi-course chef dinner',
      'Private Shikara ride on Dal Lake with flower decoration',
      'Phase 1 Gulmarg Gondola cable car tickets',
      'All private airport transfers and inter-city travel by AC Sedan',
    ],
    exclusions: [
      'Domestic flights to and from Srinagar',
      'Pony rides or snow bike rentals in Gulmarg / Sonamarg',
      'Personal laundry, beverages, and tips',
      'Travel and medical insurance',
    ],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['HALF_BOARD', 'FULL_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444001',
        dayNumber: 1,
        title: 'Arrival in Srinagar & Sunset Shikara Ride',
        activityDescription:
          'Arrive at Srinagar Airport, meet our representative, and transfer to a luxury Dal Lake houseboat. Enjoy evening Shikara ride observing floating markets and lotus gardens.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Deluxe Heritage Houseboat on Dal Lake',
      },
      {
        id: '44444444-4444-4444-8444-444444444002',
        dayNumber: 2,
        title: 'Mughal Gardens & Drive to Gulmarg',
        activityDescription:
          'Visit Shalimar Bagh and Nishat Bagh terraced Mughal gardens. Afternoon scenic drive ascending to the meadow of flowers, Gulmarg.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Alpine Pine View Resort, Gulmarg',
      },
      {
        id: '44444444-4444-4444-8444-444444444003',
        dayNumber: 3,
        title: 'Gulmarg Gondola Ride & Snow Activities',
        activityDescription:
          'Ride the world-famous Gulmarg Gondola to Kongdoori and Apharwat Peak. Experience snow walking, skiing, and panoramic views of Nanga Parbat.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Alpine Pine View Resort, Gulmarg',
      },
      {
        id: '44444444-4444-4444-8444-444444444004',
        dayNumber: 4,
        title: 'Scenic Transfer to Pahalgam (Valley of Shepherds)',
        activityDescription:
          'Drive through saffron fields of Pampore and Awantipora ruins to reach Pahalgam along the Lidder River.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Riverside Boutique Hotel, Pahalgam',
      },
      {
        id: '44444444-4444-4444-8444-444444444005',
        dayNumber: 5,
        title: 'Betaab Valley & Aru Valley Exploration',
        activityDescription:
          'Full-day local sightseeing covering Betaab Valley, Chandanwari, and Aru Valley with lush green pine forests and river walks.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Riverside Boutique Hotel, Pahalgam',
      },
      {
        id: '44444444-4444-4444-8444-444444444006',
        dayNumber: 6,
        title: 'Departure from Srinagar',
        activityDescription:
          'After breakfast, private transfer from Pahalgam back to Srinagar Airport for your onward flight with unforgettable memories.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 2. Kerala Backwaters - Family / Nature (INR)
  {
    id: '33333333-3333-4333-8333-333333333002',
    destinationId: '22222222-2222-4222-8222-222222222002',
    themeId: '11111111-1111-4111-8111-111111111006', // Family
    slug: 'kerala-backwaters-and-munnar-hills',
    title: 'Gems of Kerala: Munnar Hills & Alleppey Cruise',
    shortDescription:
      '5-day family escape through Munnar tea gardens, spice plantations, and an exclusive Alleppey houseboat cruise.',
    description:
      'Unwind in tropical Kerala. Explore the misty tea gardens of Munnar, observe wild elephants at Periyar, and cruise the peaceful backwaters of Alleppey aboard a traditional private Kettuvallam houseboat.',
    durationDays: 5,
    durationNights: 4,
    originCity: 'Kochi',
    destinationCity: 'Alleppey',
    baseAdultPrice: 3190000, // ₹31,900
    baseChildPrice: 1850000, // ₹18,500
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1506461883276-594a12b11cf3?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '4 Nights total stay (2N Munnar resort, 1N Thekkady eco-lodge, 1N Private Houseboat)',
      'All meals on houseboat (Breakfast, traditional lunch, evening tea & snacks, dinner)',
      'Tea plantation & tea factory guided tour',
      'Air-conditioned private vehicle for all transfers',
    ],
    exclusions: ['Spice garden entrance tickets', 'Ayurvedic massages', 'Airfare/Train tickets'],
    accommodationTiers: ['BUDGET', 'STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444007',
        dayNumber: 1,
        title: 'Kochi to Munnar Scenic Drive',
        activityDescription:
          'Pick up from Kochi airport/station. Drive through Cheeyappara and Valara waterfalls to reach the misty hill station of Munnar.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Tea Valley Resort, Munnar',
      },
      {
        id: '44444444-4444-4444-8444-444444444008',
        dayNumber: 2,
        title: 'Munnar Tea Estates & Mattupetty Dam',
        activityDescription:
          'Visit Mattupetty Dam, Echo Point, Kundala Lake, and Tata Tea Museum. Enjoy panoramic viewpoint walks.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Tea Valley Resort, Munnar',
      },
      {
        id: '44444444-4444-4444-8444-444444444009',
        dayNumber: 3,
        title: 'Munnar to Thekkady Wildlife Sanctuary',
        activityDescription:
          'Drive to Thekkady, visit spice plantations, and take a tranquil boat ride in Periyar Lake to spot wildlife.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Periyar Forest Lodge, Thekkady',
      },
      {
        id: '44444444-4444-4444-8444-444444444010',
        dayNumber: 4,
        title: 'Alleppey Backwaters Houseboat Cruise',
        activityDescription:
          'Board your private air-conditioned houseboat at Alleppey jetty. Glide through palm-fringed canals, paddy fields, and lagoons.',
        mealsIncluded: ['BREAKFAST', 'LUNCH', 'DINNER'],
        accommodationNotes: 'Deluxe Private Air-Conditioned Houseboat',
      },
      {
        id: '44444444-4444-4444-8444-444444444011',
        dayNumber: 5,
        title: 'Alleppey to Kochi Departure',
        activityDescription:
          'Disembark at Alleppey and transfer to Kochi Airport for departure with cherished memories of Kerala.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 3. Golden Triangle Jaipur - Heritage & Culture (INR)
  {
    id: '33333333-3333-4333-8333-333333333003',
    destinationId: '22222222-2222-4222-8222-222222222003',
    themeId: '11111111-1111-4111-8111-111111111003', // Heritage
    slug: 'royal-rajasthan-heritage-jaipur',
    title: 'Royal Rajasthan: Forts, Palaces & Heritage',
    shortDescription:
      '4-day immersive royal journey through Amber Fort, City Palace, Hawa Mahal, and colourful Johari Bazaar.',
    description:
      'Step into the regal era of Maharajas in the Pink City of Jaipur. Marvel at the sheer grandeur of Amer Fort, explore the intricate architecture of Hawa Mahal, observe the world’s largest stone sundial at Jantar Mantar, and indulge in authentic Rajasthani Thali dining.',
    durationDays: 4,
    durationNights: 3,
    originCity: 'New Delhi',
    destinationCity: 'Jaipur',
    baseAdultPrice: 2200000, // ₹22,000
    baseChildPrice: 1200000, // ₹12,000
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1603201667141-5a2d4c673378?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '3 Nights accommodation in a 4-star Heritage Haveli hotel',
      'Daily royal buffet breakfast',
      'Full-day guided tour of Amer Fort, Nahargarh Fort, and Jal Mahal',
      'Entry tickets to City Palace & Jantar Mantar',
      'Chokhi Dhani cultural village evening with traditional Rajasthani dinner',
    ],
    exclusions: ['Elephant/Jeep ride at Amer Fort', 'Camera and video fees', 'Personal shopping'],
    accommodationTiers: ['BUDGET', 'STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444012',
        dayNumber: 1,
        title: 'Arrival in Jaipur & Birla Temple Visit',
        activityDescription:
          'Arrive in Jaipur and check in at heritage haveli hotel. Evening visit to Birla Mandir followed by walking tour through local markets.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Heritage Haveli Hotel, Jaipur',
      },
      {
        id: '44444444-4444-4444-8444-444444444013',
        dayNumber: 2,
        title: 'Amer Fort, Jal Mahal & Chokhi Dhani',
        activityDescription:
          'Ascend Amer Fort, admire Sheesh Mahal (Mirror Palace), photo stop at Jal Mahal, and enjoy an evening cultural extravaganza at Chokhi Dhani.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Heritage Haveli Hotel, Jaipur',
      },
      {
        id: '44444444-4444-4444-8444-444444444014',
        dayNumber: 3,
        title: 'City Palace, Jantar Mantar & Hawa Mahal',
        activityDescription:
          'Explore the royal chambers of City Palace, UNESCO site Jantar Mantar, and capture stunning photos of the iconic Hawa Mahal facade.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'Heritage Haveli Hotel, Jaipur',
      },
      {
        id: '44444444-4444-4444-8444-444444444015',
        dayNumber: 4,
        title: 'Shopping at Bapu Bazaar & Departure',
        activityDescription:
          'Morning shopping for handcrafted blue pottery, textiles, and gemstones at Bapu Bazaar before transferring for onward journey.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 4. Goa Coastal Paradise - Beach & Leisure (INR)
  {
    id: '33333333-3333-4333-8333-333333333004',
    destinationId: '22222222-2222-4222-8222-222222222004',
    themeId: '11111111-1111-4111-8111-111111111005', // Beach
    slug: 'goa-sun-sand-and-spice',
    title: 'Goa Coastal Getaway: Sun, Sand & Portuguese Charm',
    shortDescription:
      '4-day relaxing coastal break covering North Goa beaches, Old Goa churches, and Mandovi river sunset cruise.',
    description:
      'Bask in the relaxed tropical sunshine of Goa. From lively beach shacks in Calangute and Baga to the tranquil colonial lanes of Fontainhas Latin Quarter and majestic Dudhsagar waterfall excursions.',
    durationDays: 4,
    durationNights: 3,
    originCity: 'Mumbai',
    destinationCity: 'Panaji',
    baseAdultPrice: 1950000, // ₹19,500
    baseChildPrice: 1050000, // ₹10,500
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '3 Nights accommodation in a 4-star beach resort',
      'Daily breakfast buffet',
      'One hour Mandovi River sunset cruise with cultural dance performance',
      'South Goa & Old Goa guided sightseeing tour',
      'Airport / Railway station pickup and drop by AC coach',
    ],
    exclusions: [
      'Watersports activities (parasailing, jet-ski)',
      'Club entries and alcoholic drinks',
    ],
    accommodationTiers: ['BUDGET', 'STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444016',
        dayNumber: 1,
        title: 'Arrival in Goa & Beach Relaxation',
        activityDescription:
          'Arrive at Goa Airport / Thivim station, transfer to beach resort, check in, and spend a relaxing afternoon on the beach watching the sunset.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Coastal Beachfront Resort, Calangute',
      },
      {
        id: '44444444-4444-4444-8444-444444444017',
        dayNumber: 2,
        title: 'North Goa Forts & Watersport Beaches',
        activityDescription:
          'Visit Fort Aguada overlooking the Arabian Sea, Sinquerim Beach, Baga Beach, and Anjuna Beach flea markets.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'Coastal Beachfront Resort, Calangute',
      },
      {
        id: '44444444-4444-4444-8444-444444444018',
        dayNumber: 3,
        title: 'Old Goa Heritage Churches & Sunset Cruise',
        activityDescription:
          'Explore Basilica of Bom Jesus, Se Cathedral, walk through Fontainhas Latin Quarter, followed by a lively Mandovi River sunset cruise.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'Coastal Beachfront Resort, Calangute',
      },
      {
        id: '44444444-4444-4444-8444-444444444019',
        dayNumber: 4,
        title: 'Morning Souvenir Shopping & Departure',
        activityDescription:
          'Enjoy a leisurely breakfast, shop for cashew nuts and feni at Panjim local market, and transfer to airport for departure.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 5. Ladakh Trans-Himalayas - Adventure & Nature (INR)
  {
    id: '33333333-3333-4333-8333-333333333005',
    destinationId: '22222222-2222-4222-8222-222222222005',
    themeId: '11111111-1111-4111-8111-111111111001', // Adventure
    slug: 'leh-ladakh-high-passes-and-pangong',
    title: 'Incredible Ladakh: Nubra Valley & Pangong Lake Expedition',
    shortDescription:
      '7-day high-altitude adventure across Khardung La pass, Nubra sand dunes, and magical Pangong Tso.',
    description:
      'The ultimate Himalayan bucket-list road journey. Cross Khardung La (one of the highest motorable passes in the world), ride double-humped Bactrian camels in Nubra Valley, camp beside the color-changing waters of Pangong Lake, and visit ancient Thiksey Monastery.',
    durationDays: 7,
    durationNights: 6,
    originCity: 'New Delhi',
    destinationCity: 'Leh',
    baseAdultPrice: 5200000, // ₹52,000
    baseChildPrice: 3200000, // ₹32,000
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '6 Nights stay (4N Leh hotel, 1N Nubra luxury Swiss camp, 1N Pangong Lake glamping)',
      'Breakfast and hot buffet dinner daily',
      'Oxygen cylinder equipped private 4x4 vehicle for Nubra & Pangong',
      'Inner Line Permits and environmental wildlife fees',
      'Dedicated local guide and airport transfers',
    ],
    exclusions: ['Camel ride fees at Hunder', 'Monument entry tickets', 'Personal oxygen cans'],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['HALF_BOARD', 'FULL_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444020',
        dayNumber: 1,
        title: 'Arrival in Leh & Acclimatization',
        activityDescription:
          'Arrive at Kushok Bakula Rimpochee Airport. Rest completely for the first 24 hours to acclimatize to high altitude.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Grand Dragon Boutique Hotel, Leh',
      },
      {
        id: '44444444-4444-4444-8444-444444444021',
        dayNumber: 2,
        title: 'Leh Local: Magnetic Hill, Sangam & Hall of Fame',
        activityDescription:
          'Witness the confluence of Indus and Zanskar rivers at Nimmu, experience Magnetic Hill phenomenon, and visit Pathar Sahib Gurudwara.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Grand Dragon Boutique Hotel, Leh',
      },
      {
        id: '44444444-4444-4444-8444-444444444022',
        dayNumber: 3,
        title: 'Leh to Nubra Valley via Khardung La Pass',
        activityDescription:
          'Drive over Khardung La Pass (17,582 ft). Arrive at Nubra Valley, visit Diskit Monastery, and enjoy double-humped camel safari at Hunder dunes.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Luxury Swiss Tents, Nubra Valley',
      },
      {
        id: '44444444-4444-4444-8444-444444444023',
        dayNumber: 4,
        title: 'Nubra to Pangong Tso Lake via Shyok Route',
        activityDescription:
          'Drive through the wild riverbed of Shyok to reach breathtaking Pangong Lake. Witness dramatic evening colors over the water.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Pangong Glamping Camp, Spangmik',
      },
      {
        id: '44444444-4444-4444-8444-444444444024',
        dayNumber: 5,
        title: 'Pangong Sunrise & Return to Leh via Chang La',
        activityDescription:
          'Capture sunrise reflections on Pangong Lake. Cross Chang La Pass (17,590 ft) and visit picturesque Thiksey Monastery on return to Leh.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Grand Dragon Boutique Hotel, Leh',
      },
      {
        id: '44444444-4444-4444-8444-444444444025',
        dayNumber: 6,
        title: 'Shanti Stupa, Leh Palace & Market Exploration',
        activityDescription:
          'Visit Shanti Stupa for 360-degree sunset views of the valley, explore historic Leh Palace, and shop for pashmina shawls.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Grand Dragon Boutique Hotel, Leh',
      },
      {
        id: '44444444-4444-4444-8444-444444444026',
        dayNumber: 7,
        title: 'Departure from Leh',
        activityDescription:
          'Early morning transfer to Leh Airport for flight back to Delhi with indelible Himalayan memories.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 6. Himachal Heights - Adventure / Family (INR)
  {
    id: '33333333-3333-4333-8333-333333333006',
    destinationId: '22222222-2222-4222-8222-222222222006',
    themeId: '11111111-1111-4111-8111-111111111001', // Adventure
    slug: 'manali-solang-at-tunnel-adventure',
    title: 'Manali & Atal Tunnel Mountain Escape',
    shortDescription:
      '5-day alpine holiday featuring Solang adventure sports, Atal Tunnel crossing into Sissu, and Old Manali cafes.',
    description:
      'Surround yourself with deodar cedar forests and snow peaks in Himachal Pradesh. Experience paragliding and zorbing in Solang Valley, traverse the engineering marvel of Atal Tunnel into Lahaul valley, and relax at Vashisht hot springs.',
    durationDays: 5,
    durationNights: 4,
    originCity: 'Chandigarh',
    destinationCity: 'Manali',
    baseAdultPrice: 2650000, // ₹26,500
    baseChildPrice: 1500000, // ₹15,000
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1586861635167-e5223aadc9fe?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '4 Nights stay in 4-star mountain view resort in Manali',
      'Daily breakfast and buffet dinner',
      'Excursion to Solang Valley, Atal Tunnel, and Sissu Waterfall',
      'Local sightseeing: Hadimba Temple, Vashisht Village, Mall Road',
      'Private vehicle for transfers from Chandigarh',
    ],
    exclusions: ['Paragliding and adventure ticket costs', 'Rohtang Pass NGT permit if applicable'],
    accommodationTiers: ['BUDGET', 'STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isPublished: true,
    isFeatured: false,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444027',
        dayNumber: 1,
        title: 'Chandigarh to Manali Scenic Drive',
        activityDescription:
          'Drive along the Beas River via Mandi and Kullu valley. Check in at resort and enjoy fresh mountain air.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Pine Ridge Mountain Resort, Manali',
      },
      {
        id: '44444444-4444-4444-8444-444444444028',
        dayNumber: 2,
        title: 'Hadimba Temple & Old Manali Culture',
        activityDescription:
          'Visit Hadimba Temple surrounded by cedar forests, Manu Temple in Old Manali, Tibetan Monastery, and stroll Mall Road.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Pine Ridge Mountain Resort, Manali',
      },
      {
        id: '44444444-4444-4444-8444-444444444029',
        dayNumber: 3,
        title: 'Solang Valley Adventure & Atal Tunnel',
        activityDescription:
          'Full-day adventure at Solang Valley for paragliding, followed by passing through Atal Tunnel to visit the frozen waterfalls of Sissu in Lahaul.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Pine Ridge Mountain Resort, Manali',
      },
      {
        id: '44444444-4444-4444-8444-444444444030',
        dayNumber: 4,
        title: 'Naggar Castle & River Rafting at Kullu',
        activityDescription:
          'Visit historic Naggar Castle and Roerich Art Gallery. Option for thrilling river rafting in Beas River at Kullu.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Pine Ridge Mountain Resort, Manali',
      },
      {
        id: '44444444-4444-4444-8444-444444444031',
        dayNumber: 5,
        title: 'Manali to Chandigarh Return',
        activityDescription:
          'After breakfast, drive back to Chandigarh for your onward train or flight.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 7. Andaman Islands - Beach / Luxury (INR)
  {
    id: '33333333-3333-4333-8333-333333333007',
    destinationId: '22222222-2222-4222-8222-222222222007',
    themeId: '11111111-1111-4111-8111-111111111005', // Beach
    slug: 'andaman-havelock-radhanagar-bliss',
    title: 'Andaman Tropical Dream: Havelock & Neil Islands',
    shortDescription:
      '6-day island retreat featuring Radhanagar Beach sunsets, scuba diving at Elephant Beach, and Cellular Jail Light & Sound.',
    description:
      'Discover pristine island paradise. Sail on high-speed Makruzz catamarans to Havelock Island, walk on Asia’s finest Radhanagar Beach, snorkel among vibrant coral reefs at Elephant Beach, and explore natural rock formations at Neil Island.',
    durationDays: 6,
    durationNights: 5,
    originCity: 'Chennai',
    destinationCity: 'Port Blair',
    baseAdultPrice: 4890000, // ₹48,900
    baseChildPrice: 2800000, // ₹28,000
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '5 Nights stay (2N Port Blair, 2N Havelock luxury resort, 1N Neil Island beach villa)',
      'Daily breakfast and coastal dinners',
      'Premium Makruzz / Nautika ferry tickets between islands',
      'Cellular Jail entrance & Sound and Light Show tickets',
      'Complimentary snorkeling session at Elephant Beach',
    ],
    exclusions: ['Scuba diving & Sea walk charges', 'Airfare to Port Blair', 'Camera tickets'],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isPublished: true,
    isFeatured: false,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444032',
        dayNumber: 1,
        title: 'Arrival in Port Blair & Cellular Jail Memorial',
        activityDescription:
          'Arrive at Port Blair airport. Afternoon visit to National Memorial Cellular Jail followed by the stirring Light and Sound show.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Sea Princess Beach Resort, Port Blair',
      },
      {
        id: '44444444-4444-4444-8444-444444444033',
        dayNumber: 2,
        title: 'Cruise to Havelock & Radhanagar Beach',
        activityDescription:
          'Board high-speed catamaran to Havelock Island (Swaraj Dweep). Afternoon sunset visit to world-famous Radhanagar Beach (Beach No. 7).',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Barefoot Jungle Resort, Havelock',
      },
      {
        id: '44444444-4444-4444-8444-444444444034',
        dayNumber: 3,
        title: 'Elephant Beach Coral Snorkeling',
        activityDescription:
          'Speed boat to Elephant Beach for snorkeling amidst live coral reefs, sea-walk, and marine wildlife photography.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Barefoot Jungle Resort, Havelock',
      },
      {
        id: '44444444-4444-4444-8444-444444444035',
        dayNumber: 4,
        title: 'Ferry to Neil Island (Shaheed Dweep)',
        activityDescription:
          'Morning cruise to Neil Island. Visit Bharatpur Beach, Laxmanpur Beach, and the Natural Howrah Bridge rock formation.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Summer Sands Beach Resort, Neil Island',
      },
      {
        id: '44444444-4444-4444-8444-444444444036',
        dayNumber: 5,
        title: 'Return to Port Blair & Chidiya Tapu Sunset',
        activityDescription:
          'Return ferry to Port Blair. Evening excursion to Chidiya Tapu (Bird Island) for spectacular sunset views over the ocean.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Sea Princess Beach Resort, Port Blair',
      },
      {
        id: '44444444-4444-4444-8444-444444444037',
        dayNumber: 6,
        title: 'Port Blair Airport Departure',
        activityDescription:
          'Transfer to Veer Savarkar International Airport for return flight home with tropical memories.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 8. Dubai & Emirates - Luxury / Family (USD)
  {
    id: '33333333-3333-4333-8333-333333333008',
    destinationId: '22222222-2222-4222-8222-222222222008',
    themeId: '11111111-1111-4111-8111-111111111007', // Luxury
    slug: 'dubai-luxury-burj-and-desert-safari',
    title: 'Dubai Extravaganza: Burj Khalifa & Desert Safari',
    shortDescription:
      '5-day glamorous tour featuring 124th floor Burj Khalifa entry, 4x4 desert dune safari, and Dubai Marina yacht cruise.',
    description:
      'Experience the futuristic luxury and wonder of Dubai. Ascend the world’s tallest tower at Burj Khalifa, experience thrilling 4x4 dune bashing followed by BBQ dinner in Arabian desert tents, visit Museum of the Future, and cruise Dubai Marina by luxury yacht.',
    durationDays: 5,
    durationNights: 4,
    originCity: 'Mumbai',
    destinationCity: 'Dubai',
    baseAdultPrice: 125000, // $1,250 = 125000 cents
    baseChildPrice: 75000, // $750 = 75000 cents
    currency: 'USD',
    heroImageUrl:
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1528702748617-c64d49f918af?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '4 Nights stay in 5-star hotel in Downtown / Marina Dubai',
      'Daily international buffet breakfast',
      'Burj Khalifa 124th & 125th Floor "At the Top" non-prime tickets',
      '4x4 Desert Safari with dune bashing, camel ride, Tanoura dance & BBQ dinner',
      'Dubai Marina 2-hour Luxury Dhow Cruise with international buffet',
      'All airport transfers by private luxury vehicle',
    ],
    exclusions: [
      'UAE Visa fees',
      'Tourism Dirham fee paid directly at hotel',
      'International flights',
    ],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444038',
        dayNumber: 1,
        title: 'Arrival in Dubai & Marina Dhow Dinner Cruise',
        activityDescription:
          'Arrive at Dubai International Airport (DXB). Private transfer to hotel. Evening luxury cruise around Dubai Marina skyscrapers with buffet dinner.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'JW Marriott Marquis Hotel Dubai',
      },
      {
        id: '44444444-4444-4444-8444-444444444039',
        dayNumber: 2,
        title: 'Dubai City Tour & Burj Khalifa At The Top',
        activityDescription:
          'Sightseeing covering Dubai Frame, Palm Jumeirah, and Burj Al Arab photo stop. Evening entry to Burj Khalifa 124th floor followed by Dubai Fountain Show.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'JW Marriott Marquis Hotel Dubai',
      },
      {
        id: '44444444-4444-4444-8444-444444444040',
        dayNumber: 3,
        title: 'Museum of the Future & 4x4 Desert Safari',
        activityDescription:
          'Morning visit to stunning Museum of the Future. Afternoon 4x4 Land Cruiser desert safari with dune bashing, sandboarding, and Bedouin camp BBQ feast.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'JW Marriott Marquis Hotel Dubai',
      },
      {
        id: '44444444-4444-4444-8444-444444444041',
        dayNumber: 4,
        title: 'Abu Dhabi Day Trip: Sheikh Zayed Grand Mosque',
        activityDescription:
          'Day trip to capital city Abu Dhabi. Tour the breathtaking marble architecture of Sheikh Zayed Grand Mosque and drive along Corniche.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'JW Marriott Marquis Hotel Dubai',
      },
      {
        id: '44444444-4444-4444-8444-444444444042',
        dayNumber: 5,
        title: 'Dubai Gold Souk & Airport Departure',
        activityDescription:
          'Morning shopping at traditional Deira Gold & Spice Souks before private transfer to DXB Airport for departure.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 9. Bali Indonesia - Honeymoon / Culture (USD)
  {
    id: '33333333-3333-4333-8333-333333333009',
    destinationId: '22222222-2222-4222-8222-222222222009',
    themeId: '11111111-1111-4111-8111-111111111002', // Honeymoon
    slug: 'enchanting-bali-ubud-and-seminyak',
    title: 'Enchanting Bali: Ubud Rainforest & Seminyak Sunsets',
    shortDescription:
      '6-day tropical romance through Ubud rice terraces, Sacred Monkey Forest, and private pool villa stays in Seminyak.',
    description:
      'Immerse in the magic of Bali. Swing over the emerald Tegallalang rice terraces, discover serene waterfalls, visit Tirta Empul water temple, witness Kecak fire dance at Uluwatu cliff temple, and enjoy beachfront dining in Jimbaran Bay.',
    durationDays: 6,
    durationNights: 5,
    originCity: 'Singapore',
    destinationCity: 'Denpasar',
    baseAdultPrice: 98000, // $980 = 98000 cents
    baseChildPrice: 59000, // $590 = 59000 cents
    currency: 'USD',
    heroImageUrl:
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '5 Nights stay (3N Ubud rainforest resort, 2N Seminyak private pool villa)',
      'Daily breakfast and 2 candle-lit dinners',
      'Ubud highlights tour: Tegallalang rice terraces, Bali swing, and Tegenungan waterfall',
      'Uluwatu Sunset Temple tour with Kecak Fire Dance tickets',
      'All private airport and inter-hotel transfers',
    ],
    exclusions: ['Visa on arrival ($35 USD)', 'Flight tickets to Denpasar', 'Gratuities'],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST', 'HALF_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444043',
        dayNumber: 1,
        title: 'Arrival in Bali & Transfer to Ubud',
        activityDescription:
          'Arrive at Ngurah Rai International Airport (DPS). Transfer to Ubud rainforest resort. Evening flower-bath and relaxation.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Maya Ubud Resort & Spa',
      },
      {
        id: '44444444-4444-4444-8444-444444444044',
        dayNumber: 2,
        title: 'Ubud Arts, Rice Terraces & Jungle Swing',
        activityDescription:
          'Visit Sacred Monkey Forest, Tegallalang Rice Terraces, experience the Bali Jungle Swing, and taste Luwak coffee at a local plantation.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'Maya Ubud Resort & Spa',
      },
      {
        id: '44444444-4444-4444-8444-444444444045',
        dayNumber: 3,
        title: 'Kintamani Volcano & Tirta Empul Holy Spring',
        activityDescription:
          'Panoramic views of Mount Batur volcano and crater lake. Visit historic Tirta Empul holy spring temple for a traditional blessing.',
        mealsIncluded: ['BREAKFAST', 'LUNCH'],
        accommodationNotes: 'Maya Ubud Resort & Spa',
      },
      {
        id: '44444444-4444-4444-8444-444444444046',
        dayNumber: 4,
        title: 'Transfer to Seminyak & Uluwatu Sunset Temple',
        activityDescription:
          'Drive to coastal Seminyak and check in to your private pool villa. Evening visit to dramatic Uluwatu cliff temple with Kecak fire dance.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'The Elysian Boutique Villa Hotel, Seminyak',
      },
      {
        id: '44444444-4444-4444-8444-444444444047',
        dayNumber: 5,
        title: 'Nusa Penida Island Day Excursion',
        activityDescription:
          'Speed boat to Nusa Penida island. Visit the famous T-Rex shaped Kelingking Beach, Angel’s Billabong, and Broken Beach.',
        mealsIncluded: ['BREAKFAST', 'LUNCH'],
        accommodationNotes: 'The Elysian Boutique Villa Hotel, Seminyak',
      },
      {
        id: '44444444-4444-4444-8444-444444444048',
        dayNumber: 6,
        title: 'Balinese Spa & Airport Departure',
        activityDescription:
          'Enjoy a complimentary 60-minute Balinese massage before transfer to DPS airport for flight home.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 10. Paris & French Riviera - Heritage / Romance (USD)
  {
    id: '33333333-3333-4333-8333-333333333010',
    destinationId: '22222222-2222-4222-8222-222222222010',
    themeId: '11111111-1111-4111-8111-111111111003', // Heritage
    slug: 'paris-lights-and-versailles-palace',
    title: 'Parisian Elegance: Eiffel Tower & Versailles Palace',
    shortDescription:
      '5-day European classic featuring Eiffel Tower 2nd floor, Louvre Museum guided tour, and Versailles Palace day trip.',
    description:
      'Fall in love with Paris. Ascend the Eiffel Tower for sweeping Parisian views, admire masterpieces like the Mona Lisa at the Louvre, cruise along the Seine River under illuminated bridges, and marvel at the Hall of Mirrors in the Palace of Versailles.',
    durationDays: 5,
    durationNights: 4,
    originCity: 'London',
    destinationCity: 'Paris',
    baseAdultPrice: 165000, // $1,650 = 165000 cents
    baseChildPrice: 99000, // $990 = 99000 cents
    currency: 'USD',
    heroImageUrl:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509299349698-dd22323b5963?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '4 Nights stay in a central 4-star boutique Parisian hotel',
      'Daily French breakfast with freshly baked croissants',
      'Timed entry skip-the-line tickets to Eiffel Tower (2nd floor) and Louvre Museum',
      '1-Hour scenic Seine River sightseeing cruise',
      'Full-day guided excursion to Palace and Gardens of Versailles',
    ],
    exclusions: ['Schengen Visa fees', 'City tourist tax', 'Meals not mentioned in itinerary'],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['BREAKFAST'],
    isPublished: true,
    isFeatured: false,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444049',
        dayNumber: 1,
        title: 'Arrival in Paris & Seine River Sunset Cruise',
        activityDescription:
          'Arrive at Charles de Gaulle Airport (CDG). Check in at your boutique hotel. Evening cruise on the Seine River viewing Notre Dame and the illuminated Eiffel Tower.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Hotel Saint-Germain-des-Pres, Paris',
      },
      {
        id: '44444444-4444-4444-8444-444444444050',
        dayNumber: 2,
        title: 'Eiffel Tower, Champs-Elysees & Arc de Triomphe',
        activityDescription:
          'Ascend the Eiffel Tower for panoramic city views. Stroll down Avenue des Champs-Elysees and visit Arc de Triomphe.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'Hotel Saint-Germain-des-Pres, Paris',
      },
      {
        id: '44444444-4444-4444-8444-444444444051',
        dayNumber: 3,
        title: 'Louvre Museum & Montmartre Sacre-Coeur',
        activityDescription:
          'Explore masterpieces at the Louvre Museum. Afternoon walking tour of bohemian Montmartre and Sacre-Coeur Basilica with street artists at Place du Tertre.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'Hotel Saint-Germain-des-Pres, Paris',
      },
      {
        id: '44444444-4444-4444-8444-444444444052',
        dayNumber: 4,
        title: 'Palace of Versailles Royal Day Trip',
        activityDescription:
          'Day trip by train to the opulent Palace of Versailles. Explore the Hall of Mirrors, Grand Apartments, and landscaped royal fountains.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'Hotel Saint-Germain-des-Pres, Paris',
      },
      {
        id: '44444444-4444-4444-8444-444444444053',
        dayNumber: 5,
        title: 'Paris Departure',
        activityDescription:
          'Enjoy a final cafe au lait in Saint-Germain before private transfer to CDG Airport for your return flight.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 11. Wildlife Expedition - Wildlife (INR)
  {
    id: '33333333-3333-4333-8333-333333333011',
    destinationId: '22222222-2222-4222-8222-222222222002', // Kerala / Periyar
    themeId: '11111111-1111-4111-8111-111111111004', // Wildlife
    slug: 'periyar-and-silent-valley-wildlife-trail',
    title: 'Wild Tropics: Periyar Tiger Reserve & Birding Trail',
    shortDescription:
      '4-day nature and wildlife safari through lush Western Ghats jungles, bamboo rafting, and bird sanctuaries.',
    description:
      'Venture into the pristine biodiversity hotspot of the Western Ghats. Experience guided jungle treks, bamboo rafting on Periyar Lake, spot herds of Asian elephants, Malabar giant squirrels, and endemic bird species.',
    durationDays: 4,
    durationNights: 3,
    originCity: 'Kochi',
    destinationCity: 'Alleppey',
    baseAdultPrice: 2850000, // ₹28,500
    baseChildPrice: 1600000, // ₹16,000
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1534177616072-ef7dc120449d?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1506461883276-594a12b11cf3?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '3 Nights eco-resort jungle cottage accommodation',
      'All meals (Organic farm-to-table breakfast, lunch, and dinner)',
      'Periyar National Park guided bamboo rafting and jungle walk with naturalist',
      'Night patrol walk for nocturnal wildlife observation',
      'All forest permits and park entry fees',
    ],
    exclusions: ['Camera fees in forest reserve', 'Personal hiking equipment'],
    accommodationTiers: ['STANDARD', 'LUXURY'],
    mealPlans: ['FULL_BOARD'],
    isPublished: true,
    isFeatured: false,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444054',
        dayNumber: 1,
        title: 'Arrival in Thekkady Jungle Sanctuary',
        activityDescription:
          'Transfer from Kochi to Thekkady eco-lodge. Orientation walk with resident naturalist and evening spice farm tour.',
        mealsIncluded: ['LUNCH', 'DINNER'],
        accommodationNotes: 'Spice Village Eco-Resort, Thekkady',
      },
      {
        id: '44444444-4444-4444-8444-444444444055',
        dayNumber: 2,
        title: 'Full Day Bamboo Rafting in Periyar Reserve',
        activityDescription:
          'Dawn to dusk trekking and bamboo rafting through deep forested areas of Periyar Tiger Reserve. Excellent wildlife sightings.',
        mealsIncluded: ['BREAKFAST', 'LUNCH', 'DINNER'],
        accommodationNotes: 'Spice Village Eco-Resort, Thekkady',
      },
      {
        id: '44444444-4444-4444-8444-444444444056',
        dayNumber: 3,
        title: 'Canopy Birdwatching & Kumily Spice Market',
        activityDescription:
          'Early morning birdwatching tour identifying Hornbills and Flycatchers. Afternoon at leisure exploring local tribal markets.',
        mealsIncluded: ['BREAKFAST', 'LUNCH', 'DINNER'],
        accommodationNotes: 'Spice Village Eco-Resort, Thekkady',
      },
      {
        id: '44444444-4444-4444-8444-444444444057',
        dayNumber: 4,
        title: 'Departure to Kochi',
        activityDescription:
          'Morning nature walk followed by breakfast and private vehicle transfer back to Kochi Airport.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },

  // 12. Luxury & Wellness - Luxury (INR)
  {
    id: '33333333-3333-4333-8333-333333333012',
    destinationId: '22222222-2222-4222-8222-222222222003', // Jaipur
    themeId: '11111111-1111-4111-8111-111111111007', // Luxury
    slug: 'jaipur-royal-palace-wellness-retreat',
    title: 'Maharaja Palace Luxury & Ayurvedic Spa Retreat',
    shortDescription:
      '4-day supreme luxury sanctuary featuring 5-star palace accommodation, daily signature spa therapies, and private dining.',
    description:
      'Immerse in pure royal luxury at a heritage palace property. Enjoy customized daily Ayurvedic wellness rituals, private yoga sessions at sunrise, private curated fort tours with historian guides, and bespoke candle-lit dining in royal courtyards.',
    durationDays: 4,
    durationNights: 3,
    originCity: 'New Delhi',
    destinationCity: 'Jaipur',
    baseAdultPrice: 6500000, // ₹65,000
    baseChildPrice: 3800000, // ₹38,000
    currency: 'INR',
    heroImageUrl:
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&auto=format&fit=crop&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&auto=format&fit=crop&q=80',
    ],
    inclusions: [
      '3 Nights accommodation in Royal Palace Suite with private butler',
      'Daily curated gourmet breakfast and 4-course royal dinners',
      'Daily 90-minute customized Ayurvedic spa therapy for two',
      'Private sunset champagne high-tea overlooking Nahargarh hills',
      'Private luxury Mercedes-Benz chauffeur transfers',
    ],
    exclusions: ['Vintage car rally excursions (optional add-on)'],
    accommodationTiers: ['LUXURY'],
    mealPlans: ['HALF_BOARD', 'FULL_BOARD'],
    isPublished: true,
    isFeatured: true,
    itineraries: [
      {
        id: '44444444-4444-4444-8444-444444444058',
        dayNumber: 1,
        title: 'Grand Royal Welcome & Evening Spa Therapy',
        activityDescription:
          'Royal welcome with marigold garlands and shehnai music. Check in to palace suite, followed by an evening calming Abhyanga Ayurvedic therapy.',
        mealsIncluded: ['DINNER'],
        accommodationNotes: 'Rambagh Palace / Jai Mahal Palace, Jaipur',
      },
      {
        id: '44444444-4444-4444-8444-444444444059',
        dayNumber: 2,
        title: 'Sunrise Palace Yoga & Private Amer Fort Walk',
        activityDescription:
          'Gentle sunrise yoga on marble pavilion. Private after-hours guided tour of Amer Fort with a royal historian.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Rambagh Palace / Jai Mahal Palace, Jaipur',
      },
      {
        id: '44444444-4444-4444-8444-444444444060',
        dayNumber: 3,
        title: 'Royal Spa Rejuvenation & Courtyard Gala Dinner',
        activityDescription:
          'Full-body herbal scrub and Shirodhara treatment. Evening exclusive 5-course private dinner under the stars with live classical sitar music.',
        mealsIncluded: ['BREAKFAST', 'DINNER'],
        accommodationNotes: 'Rambagh Palace / Jai Mahal Palace, Jaipur',
      },
      {
        id: '44444444-4444-4444-8444-444444444061',
        dayNumber: 4,
        title: 'Royal Breakfast & Departure',
        activityDescription:
          'Champagne breakfast in palace gardens before private luxury transfer to airport.',
        mealsIncluded: ['BREAKFAST'],
        accommodationNotes: 'End of tour services',
      },
    ],
  },
];

// ============================================================================
// SEED RUNNER IMPLEMENTATION (TRANSACTIONAL & IDEMPOTENT)
// ============================================================================

/**
 * Validates that all seed packages satisfy publication rules (BR-PKG-001).
 */
export function validateSeedDatasetIntegrity(): void {
  const destMap = new Map<string, SeedDestinationItem>();
  for (const d of SEED_DESTINATIONS) {
    destMap.set(d.id, d);
  }

  const themeMap = new Map<string, SeedThemeItem>();
  for (const t of SEED_THEMES) {
    themeMap.set(t.id, t);
  }

  for (const pkg of SEED_PACKAGES) {
    // 1. Check destination foreign key exists
    const dest = destMap.get(pkg.destinationId);
    if (!dest) {
      throw new Error(
        `Integrity Error: Package '${pkg.title}' references non-existent destination ID ${pkg.destinationId}`,
      );
    }

    // 2. Check theme foreign key if present
    if (pkg.themeId && !themeMap.has(pkg.themeId)) {
      throw new Error(
        `Integrity Error: Package '${pkg.title}' references non-existent theme ID ${pkg.themeId}`,
      );
    }

    // 3. Check publication completeness if published
    if (pkg.isPublished) {
      const destEntity = {
        id: dest.id,
        slug: dest.slug,
        cityName: dest.cityName,
        country: dest.country,
        description: dest.description,
        thumbnailUrl: dest.thumbnailUrl,
        heroImageUrl: dest.heroImageUrl,
        isFeatured: dest.isFeatured,
        isPublished: dest.isPublished,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const itineraryEntities = pkg.itineraries.map((it) => ({
        id: it.id,
        packageId: pkg.id,
        dayNumber: it.dayNumber,
        title: it.title,
        activityDescription: it.activityDescription,
        mealsIncluded: it.mealsIncluded,
        accommodationNotes: it.accommodationNotes,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const pkgEntity = {
        id: pkg.id,
        destinationId: pkg.destinationId,
        themeId: pkg.themeId,
        slug: pkg.slug,
        title: pkg.title,
        shortDescription: pkg.shortDescription,
        description: pkg.description,
        durationDays: pkg.durationDays,
        durationNights: pkg.durationNights,
        originCity: pkg.originCity,
        destinationCity: pkg.destinationCity,
        baseAdultPrice: pkg.baseAdultPrice,
        baseChildPrice: pkg.baseChildPrice,
        currency: pkg.currency,
        heroImageUrl: pkg.heroImageUrl,
        galleryUrls: pkg.galleryUrls,
        inclusions: pkg.inclusions,
        exclusions: pkg.exclusions,
        accommodationTiers: pkg.accommodationTiers,
        mealPlans: pkg.mealPlans,
        isPublished: pkg.isPublished,
        isFeatured: pkg.isFeatured,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const pubCheck = CataloguePublicationService.validatePackagePublication(
        pkgEntity,
        destEntity,
        itineraryEntities,
      );

      if (!pubCheck.isEligible) {
        throw new Error(
          `Publication Validation Invariant Failed for Package '${pkg.title}': ${pubCheck.issues
            .map((i) => `${i.field}: ${i.issue}`)
            .join('; ')}`,
        );
      }
    }
  }
}

/**
 * Seeds the travel catalogue with deterministic data idempotently.
 */
export async function seedCatalogue(
  db: DatabaseService,
  options: { isProduction?: boolean; allowProductionSeed?: boolean } = {},
): Promise<CatalogueSeedResult> {
  const { isProduction = false, allowProductionSeed = false } = options;

  // 1. Production Safety Guard
  if (isProduction && !allowProductionSeed) {
    throw new Error(
      'Production Security Guard: Explicit ALLOW_SEED=true confirmation is required to seed catalogue data into a production database.',
    );
  }

  // 2. Validate Dataset Integrity (BR-PKG-001 & Foreign Keys)
  validateSeedDatasetIntegrity();

  // 3. Atomically Upsert Records within Transaction
  return await db.withTransaction<CatalogueSeedResult>(async (client: pg.PoolClient) => {
    let themesInserted = 0;
    let themesUpdated = 0;
    let destinationsInserted = 0;
    let destinationsUpdated = 0;
    let packagesInserted = 0;
    let packagesUpdated = 0;
    let itinerariesInserted = 0;
    let itinerariesUpdated = 0;

    // A. Upsert Themes
    for (const theme of SEED_THEMES) {
      const res = await client.query<{ is_insert: boolean }>(
        `INSERT INTO themes (id, slug, title, description, icon_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           icon_url = EXCLUDED.icon_url
         RETURNING (xmax = 0) AS is_insert;`,
        [theme.id, theme.slug, theme.title, theme.description, theme.iconUrl],
      );

      if (res.rows[0]?.is_insert) {
        themesInserted++;
      } else {
        themesUpdated++;
      }
    }

    // B. Upsert Destinations
    for (const dest of SEED_DESTINATIONS) {
      const res = await client.query<{ is_insert: boolean }>(
        `INSERT INTO destinations (
           id, slug, city_name, country, description,
           thumbnail_url, hero_image_url, is_featured, is_published,
           updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           city_name = EXCLUDED.city_name,
           country = EXCLUDED.country,
           description = EXCLUDED.description,
           thumbnail_url = EXCLUDED.thumbnail_url,
           hero_image_url = EXCLUDED.hero_image_url,
           is_featured = EXCLUDED.is_featured,
           is_published = EXCLUDED.is_published,
           updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert;`,
        [
          dest.id,
          dest.slug,
          dest.cityName,
          dest.country,
          dest.description,
          dest.thumbnailUrl,
          dest.heroImageUrl,
          dest.isFeatured,
          dest.isPublished,
        ],
      );

      if (res.rows[0]?.is_insert) {
        destinationsInserted++;
      } else {
        destinationsUpdated++;
      }
    }

    // C. Upsert Tour Packages
    for (const pkg of SEED_PACKAGES) {
      const res = await client.query<{ is_insert: boolean }>(
        `INSERT INTO tour_packages (
           id, destination_id, theme_id, slug, title, short_description, description,
           duration_days, duration_nights, origin_city, destination_city,
           base_adult_price, base_child_price, currency, hero_image_url,
           gallery_urls, inclusions, exclusions, accommodation_tiers, meal_plans,
           is_published, is_featured, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
         ON CONFLICT (id) DO UPDATE SET
           destination_id = EXCLUDED.destination_id,
           theme_id = EXCLUDED.theme_id,
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           short_description = EXCLUDED.short_description,
           description = EXCLUDED.description,
           duration_days = EXCLUDED.duration_days,
           duration_nights = EXCLUDED.duration_nights,
           origin_city = EXCLUDED.origin_city,
           destination_city = EXCLUDED.destination_city,
           base_adult_price = EXCLUDED.base_adult_price,
           base_child_price = EXCLUDED.base_child_price,
           currency = EXCLUDED.currency,
           hero_image_url = EXCLUDED.hero_image_url,
           gallery_urls = EXCLUDED.gallery_urls,
           inclusions = EXCLUDED.inclusions,
           exclusions = EXCLUDED.exclusions,
           accommodation_tiers = EXCLUDED.accommodation_tiers,
           meal_plans = EXCLUDED.meal_plans,
           is_published = EXCLUDED.is_published,
           is_featured = EXCLUDED.is_featured,
           updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert;`,
        [
          pkg.id,
          pkg.destinationId,
          pkg.themeId,
          pkg.slug,
          pkg.title,
          pkg.shortDescription,
          pkg.description,
          pkg.durationDays,
          pkg.durationNights,
          pkg.originCity,
          pkg.destinationCity,
          pkg.baseAdultPrice,
          pkg.baseChildPrice,
          pkg.currency,
          pkg.heroImageUrl,
          JSON.stringify(pkg.galleryUrls),
          JSON.stringify(pkg.inclusions),
          JSON.stringify(pkg.exclusions),
          JSON.stringify(pkg.accommodationTiers),
          JSON.stringify(pkg.mealPlans),
          pkg.isPublished,
          pkg.isFeatured,
        ],
      );

      if (res.rows[0]?.is_insert) {
        packagesInserted++;
      } else {
        packagesUpdated++;
      }

      // D. Upsert Day-by-Day Itineraries
      for (const it of pkg.itineraries) {
        const itRes = await client.query<{ is_insert: boolean }>(
          `INSERT INTO itinerary_days (
             id, package_id, day_number, title, activity_description,
             meals_included, accommodation_notes, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (package_id, day_number) DO UPDATE SET
             id = EXCLUDED.id,
             title = EXCLUDED.title,
             activity_description = EXCLUDED.activity_description,
             meals_included = EXCLUDED.meals_included,
             accommodation_notes = EXCLUDED.accommodation_notes,
             updated_at = NOW()
           RETURNING (xmax = 0) AS is_insert;`,
          [
            it.id,
            pkg.id,
            it.dayNumber,
            it.title,
            it.activityDescription,
            JSON.stringify(it.mealsIncluded),
            it.accommodationNotes,
          ],
        );

        if (itRes.rows[0]?.is_insert) {
          itinerariesInserted++;
        } else {
          itinerariesUpdated++;
        }
      }
    }

    return {
      themes: { inserted: themesInserted, updated: themesUpdated },
      destinations: { inserted: destinationsInserted, updated: destinationsUpdated },
      packages: { inserted: packagesInserted, updated: packagesUpdated },
      itineraries: { inserted: itinerariesInserted, updated: itinerariesUpdated },
    };
  });
}

// ============================================================================
// CLI RUNNER
// ============================================================================

async function main(): Promise<void> {
  const config = loadEnv();
  const db = new DatabaseService(config);

  try {
    console.info('🔄 Catalogue seed started...');
    const result = await seedCatalogue(db, {
      isProduction: config.NODE_ENV === 'production',
      allowProductionSeed: process.env.ALLOW_SEED === 'true',
    });

    console.info('\nThemes:');
    console.info(`  inserted: ${result.themes.inserted}`);
    console.info(`  updated: ${result.themes.updated}`);

    console.info('\nDestinations:');
    console.info(`  inserted: ${result.destinations.inserted}`);
    console.info(`  updated: ${result.destinations.updated}`);

    console.info('\nPackages:');
    console.info(`  inserted: ${result.packages.inserted}`);
    console.info(`  updated: ${result.packages.updated}`);

    console.info('\nItineraries:');
    console.info(`  inserted: ${result.itineraries.inserted}`);
    console.info(`  updated: ${result.itineraries.updated}`);

    console.info('\n✅ Catalogue seed completed successfully.');
  } catch (err) {
    console.error('\n❌ Catalogue seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await db.close();
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('seedCatalogue.ts') || process.argv[1].endsWith('seedCatalogue.js'))
) {
  void main();
}
