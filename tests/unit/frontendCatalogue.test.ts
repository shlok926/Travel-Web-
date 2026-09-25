import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml, formatPrice, formatDuration } from '../../frontend/src/utils/formatters.js';
import { ApiClient, api } from '../../frontend/src/api/client.js';
import { renderPackageCard } from '../../frontend/src/components/packageCard.js';
import { PackageDetailModal } from '../../frontend/src/components/packageDetailModal.js';
import { CatalogueSection } from '../../frontend/src/components/catalogueSection.js';

// --- Lightweight Mock DOM for Unit Tests ---
class MockElement {
  tagName: string;
  id = '';
  className = '';
  value = '';
  innerHTML = '';
  textContent = '';
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
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

  setAttribute(name: string, val: string) {
    this.attributes.set(name, String(val));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) || null;
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
    if (sel === '#party-availability-alert') {
      const el = new MockElement('DIV');
      el.id = 'party-availability-alert';
      return el;
    }
    if (sel === '#departures-list-container') {
      const el = new MockElement('DIV');
      el.id = 'departures-list-container';
      return el;
    }
    if (sel === '#party-size-input') {
      const el = new MockElement('INPUT');
      el.id = 'party-size-input';
      el.value = '1';
      return el;
    }
    return null;
  }

  querySelectorAll(_sel: string): MockElement[] {
    return [];
  }

  scrollIntoView(_opts?: any) {}
}

describe('Phase 4 Step 6 — Frontend Search, Filters, Departures & Availability', () => {
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

  describe('1. Utility Formatters & Sanitizers (FR-SEARCH / SECURITY)', () => {
    it('escapeHtml escapes dangerous XSS injection vectors in package data', () => {
      const raw = '<script>alert("XSS")</script> <img src=x onerror=alert(1)> & \'hello\'';
      const escaped = escapeHtml(raw);
      expect(escaped).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt; &amp; &#039;hello&#039;',
      );
    });

    it('escapeHtml safely handles null and undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('formatPrice converts integer minor units (paise/cents) into formatted currency without floating point drift', () => {
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

  describe('2. Phase 4 API Client Methods (FR-SEARCH / FR-INVENT)', () => {
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

    it('searchPackages builds canonical query parameters and returns items + pagination meta', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ id: '1', slug: 'kashmir-honeymoon', title: 'Kashmir Honeymoon' }],
          meta: {
            page: 1,
            limit: 12,
            total: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        }),
      });

      const res = await client.searchPackages({
        q: 'Kashmir',
        destinationSlug: 'kashmir-valley',
        themeSlug: 'honeymoon',
        minDuration: 3,
        maxDuration: 7,
        maxPrice: 5000000,
        sortBy: 'price_asc',
        page: 1,
        limit: 12,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/packages/search?q=Kashmir&destinationSlug=kashmir-valley&themeSlug=honeymoon&minDuration=3&maxDuration=7&maxPrice=5000000&sortBy=price_asc&page=1&limit=12',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res.items).toHaveLength(1);
      expect(res.pagination.total).toBe(1);
    });

    it('getPackageDepartures sends GET request to /packages/:slug/departures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              departureId: 'dep-1',
              packageId: 'pkg-1',
              departureDate: '2026-10-15',
              returnDate: '2026-10-21',
              totalCapacity: 20,
              availableSeats: 12,
              availabilityStatus: 'AVAILABLE',
              effectiveAdultPrice: 4500000,
              currency: 'INR',
            },
          ],
          meta: { total: 1 },
        }),
      });

      const res = await client.getPackageDepartures('kashmir-honeymoon');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/packages/kashmir-honeymoon/departures',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res).toHaveLength(1);
      expect(res[0].departureDate).toBe('2026-10-15');
    });

    it('getDepartureAvailability sends GET request to /departures/:id/availability with partySize', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            departureId: 'dep-1',
            packageId: 'pkg-1',
            departureDate: '2026-10-15',
            returnDate: '2026-10-21',
            totalCapacity: 20,
            availableSeats: 4,
            availabilityStatus: 'FEW_SEATS_LEFT',
            isAvailableForParty: true,
            requestedPartySize: 2,
            effectiveAdultPrice: 4500000,
            currency: 'INR',
          },
        }),
      });

      const res = await client.getDepartureAvailability('dep-1', { partySize: 2 });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/departures/dep-1/availability?partySize=2',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res.availabilityStatus).toBe('FEW_SEATS_LEFT');
      expect(res.isAvailableForParty).toBe(true);
      expect(res.requestedPartySize).toBe(2);
    });
  });

  describe('3. Package Card Presentation & Next Departure Badges (FR-SEARCH / FR-INVENT)', () => {
    it('renderPackageCard renders next departure date, live availability badge and effective price', () => {
      const pkg = {
        id: 'pkg-1',
        slug: 'kashmir-honeymoon',
        title: 'Splendid Kashmir Honeymoon',
        shortDescription: '6 Days in paradise.',
        durationDays: 6,
        durationNights: 5,
        baseAdultPrice: 4500000,
        currency: 'INR',
        heroImageUrl: 'https://images.example.com/pkg.jpg',
        isFeatured: true,
        destinationCity: 'Srinagar',
        theme: { title: 'Honeymoon' },
        nextDeparture: {
          departureId: 'dep-1',
          departureDate: '2026-10-15',
          returnDate: '2026-10-21',
          availableSeats: 3,
          availabilityStatus: 'FEW_SEATS_LEFT',
          effectiveAdultPrice: 4200000,
          currency: 'INR',
        },
      };

      const html = renderPackageCard(pkg);
      expect(html).toContain('Splendid Kashmir Honeymoon');
      expect(html).toContain('6D / 5N');
      expect(html).toContain('₹42,000'); // Effective price override
      expect(html).toContain('2026-10-15');
      expect(html).toContain('badge-few-seats');
      expect(html).toContain('Only 3 Left!');
    });

    it('renderPackageCard correctly renders SOLD_OUT status', () => {
      const pkg = {
        id: 'pkg-2',
        slug: 'ladakh-bike-trip',
        title: 'Ladakh Adventure',
        shortDescription: 'Epic motorcycle expedition.',
        durationDays: 8,
        durationNights: 7,
        baseAdultPrice: 6500000,
        currency: 'INR',
        nextDeparture: {
          departureId: 'dep-2',
          departureDate: '2026-11-01',
          returnDate: '2026-11-09',
          availableSeats: 0,
          availabilityStatus: 'SOLD_OUT',
          effectiveAdultPrice: 6500000,
          currency: 'INR',
        },
      };

      const html = renderPackageCard(pkg);
      expect(html).toContain('badge-sold-out');
      expect(html).toContain('Sold Out');
    });

    it('renderPackageCard sanitizes potential XSS in titles and descriptions', () => {
      const pkg = {
        id: 'pkg-xss',
        slug: 'xss-package',
        title: '<script>alert("hacked")</script>',
        shortDescription: '<img src=x onerror=alert(1)>',
        durationDays: 5,
        durationNights: 4,
        baseAdultPrice: 3000000,
        destinationCity: '<b onmouseover=alert(1)>City</b>',
      };

      const html = renderPackageCard(pkg);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
  });

  describe('4. Package Detail Modal & Live Departures (FR-INVENT-001 / FR-INVENT-002 / FR-INVENT-003)', () => {
    let mockContainer: MockElement;
    let mockAlertBox: MockElement;
    let mockListContainer: MockElement;
    let mockPartyInput: MockElement;

    beforeEach(() => {
      mockContainer = new MockElement('DIV');
      mockContainer.id = 'package-detail-modal';
      mockAlertBox = new MockElement('DIV');
      mockAlertBox.id = 'party-availability-alert';
      mockListContainer = new MockElement('DIV');
      mockListContainer.id = 'departures-list-container';
      mockPartyInput = new MockElement('INPUT');
      mockPartyInput.id = 'party-size-input';
      mockPartyInput.value = '1';

      mockDoc.getElementById.mockImplementation((id: string) => {
        if (id === 'package-detail-modal') return mockContainer;
        if (id === 'party-availability-alert') return mockAlertBox;
        if (id === 'departures-list-container') return mockListContainer;
        if (id === 'party-size-input') return mockPartyInput;
        return null;
      });
    });

    it('PackageDetailModal.open loads departures and renders departure dates, status, and pricing', async () => {
      const departures = [
        {
          departureId: 'dep-1',
          packageId: 'pkg-1',
          departureDate: '2026-10-15',
          returnDate: '2026-10-21',
          totalCapacity: 20,
          availableSeats: 10,
          availabilityStatus: 'AVAILABLE',
          isAvailableForParty: true,
          effectiveAdultPrice: 4500000,
          currency: 'INR',
        },
        {
          departureId: 'dep-2',
          packageId: 'pkg-1',
          departureDate: '2026-11-01',
          returnDate: '2026-11-07',
          totalCapacity: 20,
          availableSeats: 0,
          availabilityStatus: 'SOLD_OUT',
          isAvailableForParty: false,
          effectiveAdultPrice: 4500000,
          currency: 'INR',
        },
      ];

      vi.spyOn(ApiClient.prototype, 'getPackageDepartures').mockResolvedValueOnce(
        departures as any,
      );
      vi.spyOn(ApiClient.prototype, 'getDepartureAvailability').mockResolvedValueOnce(
        departures[0] as any,
      );

      const pkg = {
        id: 'pkg-1',
        slug: 'kashmir-honeymoon',
        title: 'Splendid Kashmir Honeymoon',
        shortDescription: '6 Days tour.',
        description: 'Detailed description.',
        durationDays: 6,
        durationNights: 5,
        baseAdultPrice: 4500000,
        currency: 'INR',
      };

      await PackageDetailModal.open(pkg);

      expect(mockContainer.classList.contains('hidden')).toBe(false);
      expect(mockContainer.innerHTML).toContain('Upcoming Departures & Availability');
      expect(mockContainer.innerHTML).toContain('Party Size:');
      expect(mockListContainer.innerHTML).toContain('2026-10-15');
      expect(mockListContainer.innerHTML).toContain('Available (10 seats)');
      expect(mockListContainer.innerHTML).toContain('Sold Out');
      expect(mockListContainer.innerHTML).toContain('disabled');
    });

    it('PackageDetailModal warns when party size exceeds available seats (isAvailableForParty: false)', async () => {
      PackageDetailModal.departures = [
        {
          departureId: 'dep-1',
          packageId: 'pkg-1',
          departureDate: '2026-10-15',
          returnDate: '2026-10-21',
          totalCapacity: 20,
          availableSeats: 2,
          availabilityStatus: 'FEW_SEATS_LEFT',
          isAvailableForParty: false,
          requestedPartySize: 5,
          effectiveAdultPrice: 4500000,
          currency: 'INR',
        },
      ];

      vi.spyOn(ApiClient.prototype, 'getDepartureAvailability').mockResolvedValueOnce({
        departureId: 'dep-1',
        packageId: 'pkg-1',
        departureDate: '2026-10-15',
        returnDate: '2026-10-21',
        totalCapacity: 20,
        availableSeats: 2,
        availabilityStatus: 'FEW_SEATS_LEFT',
        isAvailableForParty: false,
        requestedPartySize: 5,
        effectiveAdultPrice: 4500000,
        currency: 'INR',
      } as any);

      await PackageDetailModal.checkPartyAvailability('dep-1', 5);

      expect(mockAlertBox.innerHTML).toContain('Limited Seats Available');
      expect(mockAlertBox.innerHTML).toContain('less than your party size of 5');
    });
  });

  describe('5. CatalogueSection Search, Filters & Pagination (FR-SEARCH-001..004)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      CatalogueSection.state.filters = {
        q: '',
        destinationSlug: null as string | null,
        themeSlug: null as string | null,
        minDuration: null as number | null,
        maxDuration: null as number | null,
        maxPrice: null as number | null,
        sortBy: null as string | null,
        page: 1,
        limit: 12,
      };
      CatalogueSection.state.packages = [];
      CatalogueSection.state.destinations = [];
      CatalogueSection.state.themes = [];
      CatalogueSection.pkgContainer = new MockElement('DIV');
      CatalogueSection.destContainer = new MockElement('DIV');
      CatalogueSection.themeBar = new MockElement('DIV');
      CatalogueSection.filterStatusContainer = new MockElement('DIV');
      CatalogueSection.paginationContainer = new MockElement('NAV');
      mockDoc.getElementById.mockReturnValue(new MockElement('DIV'));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('resetFilters resets all filter state to default and fetches packages', () => {
      CatalogueSection.state.filters.q = 'Kashmir';
      CatalogueSection.state.filters.destinationSlug = 'kashmir-valley';
      CatalogueSection.state.filters.sortBy = 'price_asc';
      CatalogueSection.state.filters.page = 3;

      const loadPackagesSpy = vi.spyOn(CatalogueSection, 'loadPackages').mockResolvedValue();
      const renderThemesSpy = vi
        .spyOn(CatalogueSection, 'renderThemes')
        .mockImplementation(() => {});

      CatalogueSection.resetFilters();

      expect(CatalogueSection.state.filters.q).toBe('');
      expect(CatalogueSection.state.filters.destinationSlug).toBeNull();
      expect(CatalogueSection.state.filters.sortBy).toBeNull();
      expect(CatalogueSection.state.filters.page).toBe(1);
      expect(renderThemesSpy).toHaveBeenCalled();
      expect(loadPackagesSpy).toHaveBeenCalled();
    });

    it('goToPage updates page and reloads packages', () => {
      const loadPackagesSpy = vi.spyOn(CatalogueSection, 'loadPackages').mockResolvedValue();
      CatalogueSection.goToPage(2);
      expect(CatalogueSection.state.filters.page).toBe(2);
      expect(loadPackagesSpy).toHaveBeenCalled();
    });

    it('stale search responses are ignored if a newer search was initiated', async () => {
      let resolveFirst: Function;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const spy = vi.spyOn(api, 'searchPackages');
      spy.mockImplementationOnce(() => firstPromise as any);
      spy.mockImplementationOnce(
        async () =>
          ({
            items: [{ id: 'pkg-2', title: 'Dubai Luxury' }],
            pagination: {
              page: 1,
              limit: 12,
              total: 1,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          }) as any,
      );

      // Trigger first search (Paris)
      CatalogueSection.state.filters.q = 'Paris';
      const firstCall = CatalogueSection.loadPackages();

      // Immediately trigger second search (Dubai)
      CatalogueSection.state.filters.q = 'Dubai';
      const secondCall = CatalogueSection.loadPackages();

      // Resolve second search first
      await secondCall;
      expect(CatalogueSection.state.packages).toEqual([{ id: 'pkg-2', title: 'Dubai Luxury' }]);

      // Now resolve the first slower search (Paris)
      resolveFirst!({
        items: [{ id: 'pkg-1', title: 'Paris Romance' }],
        pagination: {
          page: 1,
          limit: 12,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
      await firstCall;

      // Ensure Dubai results were NOT overwritten by stale Paris response
      expect(CatalogueSection.state.packages).toEqual([{ id: 'pkg-2', title: 'Dubai Luxury' }]);
    });
  });
});
