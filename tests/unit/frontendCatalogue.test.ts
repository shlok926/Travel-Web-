import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  formatPrice,
  formatDuration,
  FALLBACK_IMAGE,
} from '../../frontend/src/utils/formatters.js';
import { ApiClient } from '../../frontend/src/api/client.js';
import { renderDestinationCard } from '../../frontend/src/components/destinationCard.js';
import { renderPackageCard } from '../../frontend/src/components/packageCard.js';
import { PackageDetailModal } from '../../frontend/src/components/packageDetailModal.js';
import { CatalogueSection } from '../../frontend/src/components/catalogueSection.js';

// --- Lightweight Mock DOM for Unit Tests ---
class MockElement {
  tagName: string;
  id = '';
  className = '';
  innerHTML = '';
  textContent = '';
  style: Record<string, string> = {};
  classList = {
    classes: new Set<string>(),
    add: (cls: string) => this.classList.classes.add(cls),
    remove: (cls: string) => this.classList.classes.delete(cls),
    contains: (cls: string) => this.classList.classes.has(cls),
  };
  eventListeners = new Map<string, Function[]>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  addEventListener(type: string, fn: Function) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(fn);
  }

  querySelector(sel: string): MockElement | null {
    if (sel === '#package-modal-close') {
      const btn = new MockElement('BUTTON');
      btn.id = 'package-modal-close';
      return btn;
    }
    return null;
  }

  querySelectorAll(_sel: string): MockElement[] {
    return [];
  }

  scrollIntoView(_opts?: any) {}
}

describe('Phase 3 Step 6 — Frontend Catalogue UI & Dynamic Experience', () => {
  let mockDoc: any;
  let mockWin: any;

  beforeEach(() => {
    mockDoc = {
      body: new MockElement('BODY'),
      getElementById: vi.fn(),
      addEventListener: vi.fn(),
    };

    mockWin = {
      location: { hash: '' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    (globalThis as any).document = mockDoc;
    (globalThis as any).window = mockWin;
  });

  describe('1. Utility Formatters & Sanitizers', () => {
    it('escapeHtml escapes dangerous XSS injection vectors', () => {
      const raw = '<script>alert("XSS")</script> & \'hello\'';
      const escaped = escapeHtml(raw);
      expect(escaped).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &#039;hello&#039;',
      );
    });

    it('escapeHtml safely handles null and undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('formatPrice converts integer minor units (paise/cents) to localized currency', () => {
      // 45,000 INR = 4,500,000 paise
      expect(formatPrice(4500000, 'INR')).toBe('₹45,000');
      // 250 USD = 25,000 cents
      expect(formatPrice(25000, 'USD')).toBe('$250');
      // Decimal price (e.g. ₹45,000.50)
      expect(formatPrice(4500050, 'INR')).toBe('₹45,000.5');
    });

    it('formatPrice gracefully handles null or invalid values', () => {
      expect(formatPrice(null as any)).toBe('Price on request');
      expect(formatPrice(undefined as any)).toBe('Price on request');
      expect(formatPrice('invalid')).toBe('Price on request');
    });

    it('formatDuration returns concise day and night formatting', () => {
      expect(formatDuration(6, 5)).toBe('6D / 5N');
      expect(formatDuration(1, 0)).toBe('1 Day');
      expect(formatDuration(3, 0)).toBe('3 Days');
    });
  });

  describe('2. API Client Catalogue Methods', () => {
    let client: ApiClient;
    let mockFetch: any;

    beforeEach(() => {
      client = new ApiClient('http://localhost:3000/api/v1');
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('getDestinations sends GET request to /destinations with query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ id: '1', slug: 'kashmir-valley', cityName: 'Srinagar' }],
        }),
      });

      const res = await client.getDestinations({ isFeatured: true, limit: 10 });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/destinations?limit=10&isFeatured=true',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res).toHaveLength(1);
    });

    it('getDestinationBySlug sends GET request to /destinations/:slug with URI encoding', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: '1', slug: 'kashmir-valley', cityName: 'Srinagar' },
        }),
      });

      const res = await client.getDestinationBySlug('kashmir-valley');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/destinations/kashmir-valley',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res.slug).toBe('kashmir-valley');
    });

    it('getThemes sends GET request to /themes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ id: '1', slug: 'honeymoon', title: 'Honeymoon' }],
        }),
      });

      const res = await client.getThemes();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/themes',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res).toHaveLength(1);
    });

    it('getPackages sends GET request to /packages with destination and theme filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ id: '1', slug: 'kashmir-honeymoon', title: 'Kashmir Honeymoon' }],
        }),
      });

      const res = await client.getPackages({
        destinationSlug: 'kashmir-valley',
        themeSlug: 'honeymoon',
        limit: 12,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/packages?limit=12&destinationSlug=kashmir-valley&themeSlug=honeymoon',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res).toHaveLength(1);
    });

    it('getPackageBySlug sends GET request to /packages/:slug', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: '1', slug: 'kashmir-honeymoon', title: 'Kashmir Honeymoon' },
        }),
      });

      const res = await client.getPackageBySlug('kashmir-honeymoon');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/packages/kashmir-honeymoon',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res.slug).toBe('kashmir-honeymoon');
    });
  });

  describe('3. Catalogue Component Templates', () => {
    it('renderDestinationCard renders dynamic city, country, image and featured badge', () => {
      const dest = {
        id: '1',
        slug: 'kashmir-valley',
        cityName: 'Srinagar',
        country: 'India',
        description: 'Paradise on Earth with snow-clad mountains and lakes.',
        thumbnailUrl: 'https://images.example.com/kashmir.jpg',
        isFeatured: true,
      };

      const html = renderDestinationCard(dest);
      expect(html).toContain('Srinagar');
      expect(html).toContain('India');
      expect(html).toContain('Paradise on Earth');
      expect(html).toContain('badge-featured');
      expect(html).toContain('data-slug="kashmir-valley"');
      expect(html).toContain('https://images.example.com/kashmir.jpg');
    });

    it('renderDestinationCard uses fallback image when thumbnailUrl is missing', () => {
      const dest = {
        id: '1',
        slug: 'ladakh',
        cityName: 'Leh',
        country: 'India',
        description: 'Land of high passes.',
        thumbnailUrl: null,
        isFeatured: false,
      };

      const html = renderDestinationCard(dest);
      expect(html).toContain(FALLBACK_IMAGE);
      expect(html).not.toContain('badge-featured');
    });

    it('renderPackageCard renders dynamic title, duration, price and destination city', () => {
      const pkg = {
        id: '1',
        slug: 'kashmir-honeymoon',
        title: 'Splendid Kashmir Honeymoon',
        shortDescription: '6 Days in paradise with Shikara ride and Gulmarg Gondola.',
        durationDays: 6,
        durationNights: 5,
        baseAdultPrice: 4500000,
        currency: 'INR',
        heroImageUrl: 'https://images.example.com/pkg.jpg',
        isFeatured: true,
        destination: { cityName: 'Srinagar' },
        theme: { title: 'Honeymoon' },
      };

      const html = renderPackageCard(pkg);
      expect(html).toContain('Splendid Kashmir Honeymoon');
      expect(html).toContain('6D / 5N');
      expect(html).toContain('₹45,000');
      expect(html).toContain('Srinagar');
      expect(html).toContain('Honeymoon');
      expect(html).toContain('badge-featured');
    });
  });

  describe('4. Package Detail Modal & Day-wise Itinerary', () => {
    let mockContainer: MockElement;

    beforeEach(() => {
      mockContainer = new MockElement('DIV');
      mockContainer.id = 'package-detail-modal';
      mockDoc.getElementById.mockImplementation((id: string) => {
        if (id === 'package-detail-modal') return mockContainer;
        return null;
      });
    });

    it('PackageDetailModal.open renders full overview, inclusions, exclusions, and day-wise itinerary', () => {
      const fullPackage = {
        id: 'pkg-1',
        slug: 'splendid-kashmir',
        title: 'Splendid Kashmir Tour',
        shortDescription: '6 Days tour in paradise.',
        description: 'Comprehensive overview of Kashmir scenic beauty.',
        durationDays: 6,
        durationNights: 5,
        baseAdultPrice: 4500000,
        baseChildPrice: 2250000,
        currency: 'INR',
        heroImageUrl: 'https://images.example.com/hero.jpg',
        galleryUrls: ['https://images.example.com/g1.jpg'],
        inclusions: ['Houseboat Stay', 'Daily Breakfast & Dinner', 'Shikara Ride'],
        exclusions: ['Airfare', 'Personal Expenses'],
        accommodationTiers: ['STANDARD', 'LUXURY'],
        mealPlans: ['BREAKFAST', 'HALF_BOARD'],
        destination: { cityName: 'Srinagar', country: 'India' },
        theme: { title: 'Family' },
        itinerary: [
          {
            dayNumber: 1,
            title: 'Arrival in Srinagar',
            activityDescription: 'Airport pickup, transfer to Houseboat, Dal Lake Shikara ride.',
            mealsIncluded: ['DINNER'],
            accommodationNotes: 'Deluxe Houseboat',
          },
          {
            dayNumber: 2,
            title: 'Gulmarg Excursion',
            activityDescription: 'Full day trip to Gulmarg with Gondola cable car ride.',
            mealsIncluded: ['BREAKFAST', 'DINNER'],
            accommodationNotes: 'Gulmarg Resort',
          },
        ],
      };

      PackageDetailModal.open(fullPackage);

      expect(mockContainer.classList.contains('hidden')).toBe(false);
      expect(mockContainer.innerHTML).toContain('Splendid Kashmir Tour');
      expect(mockContainer.innerHTML).toContain('₹45,000');
      expect(mockContainer.innerHTML).toContain('₹22,500');
      expect(mockContainer.innerHTML).toContain('Houseboat Stay');
      expect(mockContainer.innerHTML).toContain('Airfare');
      expect(mockContainer.innerHTML).toContain('Day 1');
      expect(mockContainer.innerHTML).toContain('Arrival in Srinagar');
      expect(mockContainer.innerHTML).toContain('Day 2');
      expect(mockContainer.innerHTML).toContain('Gulmarg Excursion');
      expect(mockContainer.innerHTML).toContain('Deluxe Houseboat');
    });

    it('PackageDetailModal.close hides modal and clears contents', () => {
      PackageDetailModal.open({ title: 'Test', durationDays: 1, durationNights: 0 });
      PackageDetailModal.close();
      expect(mockContainer.classList.contains('hidden')).toBe(true);
      expect(mockContainer.innerHTML).toBe('');
    });
  });

  describe('5. CatalogueSection Orchestrator & Filtering', () => {
    beforeEach(() => {
      CatalogueSection.currentFilter = { destinationSlug: null, themeSlug: null };
      CatalogueSection.state = {
        destinations: [],
        themes: [],
        packages: [],
        loadingDestinations: false,
        loadingPackages: false,
        errorDestinations: null,
        errorPackages: null,
      };
      mockDoc.getElementById.mockReturnValue(new MockElement('DIV'));
    });

    it('filterByDestination sets destinationSlug filter and reloads packages', () => {
      const loadPackagesSpy = vi.spyOn(CatalogueSection, 'loadPackages').mockResolvedValue();
      CatalogueSection.filterByDestination('kashmir-valley');
      expect(CatalogueSection.currentFilter.destinationSlug).toBe('kashmir-valley');
      expect(loadPackagesSpy).toHaveBeenCalled();
    });

    it('filterByTheme sets themeSlug filter and reloads packages', () => {
      const loadPackagesSpy = vi.spyOn(CatalogueSection, 'loadPackages').mockResolvedValue();
      const renderThemesSpy = vi
        .spyOn(CatalogueSection, 'renderThemes')
        .mockImplementation(() => {});
      CatalogueSection.filterByTheme('honeymoon');
      expect(CatalogueSection.currentFilter.themeSlug).toBe('honeymoon');
      expect(renderThemesSpy).toHaveBeenCalled();
      expect(loadPackagesSpy).toHaveBeenCalled();
    });

    it('clearFilters resets all filters and reloads packages', () => {
      CatalogueSection.currentFilter = {
        destinationSlug: 'kashmir-valley',
        themeSlug: 'honeymoon',
      };
      const loadPackagesSpy = vi.spyOn(CatalogueSection, 'loadPackages').mockResolvedValue();
      const renderThemesSpy = vi
        .spyOn(CatalogueSection, 'renderThemes')
        .mockImplementation(() => {});
      CatalogueSection.clearFilters();
      expect(CatalogueSection.currentFilter.destinationSlug).toBeNull();
      expect(CatalogueSection.currentFilter.themeSlug).toBeNull();
      expect(renderThemesSpy).toHaveBeenCalled();
      expect(loadPackagesSpy).toHaveBeenCalled();
    });
  });
});
