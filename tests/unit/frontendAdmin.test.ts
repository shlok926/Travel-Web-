import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authStore } from '../../frontend/src/state/auth.js';
import { api } from '../../frontend/src/api/client.js';
import { AdminConsole } from '../../frontend/src/components/admin/adminConsole.js';
import { AdminDashboardTab } from '../../frontend/src/components/admin/adminDashboardTab.js';
import { AdminSlidersTab } from '../../frontend/src/components/admin/adminSlidersTab.js';
import { AdminPagesTab } from '../../frontend/src/components/admin/adminPagesTab.js';
import { AdminPackagesTab } from '../../frontend/src/components/admin/adminPackagesTab.js';
import { AdminInventoryTab } from '../../frontend/src/components/admin/adminInventoryTab.js';
import { AdminBookingsTab } from '../../frontend/src/components/admin/adminBookingsTab.js';
import { AdminCancellationsTab } from '../../frontend/src/components/admin/adminCancellationsTab.js';
import { AdminAuditTab } from '../../frontend/src/components/admin/adminAuditTab.js';
import { NavbarComponent } from '../../frontend/src/components/navbar.js';

// --- Lightweight DOM Test Environment Harness ---

class MockClassList {
  classes = new Set<string>();

  add(...tokens: string[]) {
    tokens.forEach((t) => this.classes.add(t));
  }

  remove(...tokens: string[]) {
    tokens.forEach((t) => this.classes.delete(t));
  }

  contains(token: string) {
    return this.classes.has(token);
  }

  get value() {
    return Array.from(this.classes).join(' ');
  }
}

class MockElement {
  tagName: string;
  id = '';
  className = '';
  type = '';
  name = '';
  _value: string | undefined = undefined;
  placeholder = '';
  autocomplete = '';
  disabled = false;
  checked = false;
  _textContent = '';
  _innerHTML = '';
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  classList = new MockClassList();
  eventListeners = new Map<string, Array<(event: any) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get value(): string {
    if (this._value !== undefined) return this._value;
    return this._textContent || '';
  }

  set value(val: string) {
    this._value = val;
  }

  get textContent(): string {
    const direct = this._textContent;
    const childText = this.children
      .map((c) => c.textContent)
      .filter(Boolean)
      .join(' ');
    if (direct && childText) return `${direct} ${childText}`;
    return direct || childText;
  }

  set textContent(val: string) {
    this._textContent = val;
    this.children = [];
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    const list = this.eventListeners.get(type) || [];
    this.eventListeners.set(
      type,
      list.filter((l) => l !== listener),
    );
  }

  dispatchEvent(event: any) {
    if (!event.target) {
      event.target = this;
    }
    const list = this.eventListeners.get(event.type) || [];
    for (const listener of list) {
      listener(event);
    }
    return !event.defaultPrevented;
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  contains(node: MockElement | null): boolean {
    if (!node) return false;
    if (node === this) return true;
    let curr = node.parentElement;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  focus() {
    (globalThis as any).document.activeElement = this;
  }

  querySelector(selector: string): MockElement | null {
    return findFirst(this, selector);
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    findAll(this, selector, results);
    return results;
  }

  get innerHTML(): string {
    return serializeHtml(this);
  }

  set innerHTML(html: string) {
    this.children = [];
    this._textContent = '';
    parseHtmlInto(html, this);
  }
}

function serializeHtml(el: MockElement): string {
  let html = el._textContent || '';
  for (const child of el.children) {
    const tag = child.tagName.toLowerCase();
    html += `<${tag}`;
    for (const [attr, val] of child.attributes) {
      html += ` ${attr}="${val}"`;
    }
    if (child.id && !child.attributes.has('id')) html += ` id="${child.id}"`;
    if (child.className && !child.attributes.has('class')) html += ` class="${child.className}"`;
    html += '>';
    html += serializeHtml(child);
    if (!VOID_ELEMENTS.has(child.tagName)) {
      html += `</${tag}>`;
    }
  }
  return html;
}

function findFirst(root: MockElement, selector: string): MockElement | null {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) return child;
    const found = findFirst(child, selector);
    if (found) return found;
  }
  return null;
}

function findAll(root: MockElement, selector: string, results: MockElement[]) {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) results.push(child);
    findAll(child, selector, results);
  }
}

function matchesSelector(el: MockElement, selector: string): boolean {
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return el.classList.contains(cls) || el.className.split(/\s+/).includes(cls);
  }
  const attrMatch = selector.match(/^([a-z0-9]+)?\[([a-z0-9_-]+)(?:=["']([^"']*)["'])?\]$/i);
  if (attrMatch) {
    const tag = attrMatch[1];
    const attrName = attrMatch[2];
    const attrVal = attrMatch[3];
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (!attrName) return false;
    if (attrVal !== undefined) {
      return el.getAttribute(attrName) === attrVal;
    }
    return el.attributes.has(attrName);
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

const VOID_ELEMENTS = new Set([
  'AREA',
  'BASE',
  'BR',
  'COL',
  'EMBED',
  'HR',
  'IMG',
  'INPUT',
  'LINK',
  'META',
  'PARAM',
  'SOURCE',
  'TRACK',
  'WBR',
]);

function parseHtmlInto(html: string, root: MockElement) {
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const tokenRegex = /(<\/?[a-z0-9]+[^>]*\/?>)|([^<]+)/gi;
  const stack: MockElement[] = [root];
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(cleanHtml)) !== null) {
    const [, tagMatch, textMatch] = match;
    const currentParent = stack[stack.length - 1];

    if (textMatch) {
      const trimmed = textMatch.trim();
      if (trimmed && currentParent) {
        currentParent._textContent =
          (currentParent._textContent ? currentParent._textContent + ' ' : '') + trimmed;
      }
      continue;
    }

    if (tagMatch) {
      if (tagMatch.startsWith('</')) {
        const closeTagName = tagMatch.slice(2, -1).trim().toUpperCase();
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i]?.tagName === closeTagName) {
            stack.splice(i, stack.length - i);
            break;
          }
        }
        continue;
      }

      const isSelfClosing = tagMatch.endsWith('/>');
      const tagContent = tagMatch.slice(1, isSelfClosing ? -2 : -1).trim();
      const firstSpace = tagContent.search(/\s/);
      const tagName = (
        firstSpace === -1 ? tagContent : tagContent.slice(0, firstSpace)
      ).toUpperCase();
      const rawAttrs = firstSpace === -1 ? '' : tagContent.slice(firstSpace).trim();

      const el = new MockElement(tagName);

      const attrRegex = /([a-z0-9_-]+)(?:=["']([^"']*)["'])?/gi;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const name = attrMatch[1]!;
        const val = attrMatch[2] ?? '';
        if (name === 'id') el.id = val;
        else if (name === 'class') {
          el.className = val;
          val.split(/\s+/).forEach((c) => c && el.classList.add(c));
        } else if (name === 'type') el.type = val;
        else if (name === 'name') el.name = val;
        else if (name === 'placeholder') el.placeholder = val;
        else if (name === 'value') el.value = val;
        else if (name === 'checked') el.checked = true;
        else el.setAttribute(name, val);
      }

      if (currentParent) {
        currentParent.appendChild(el);
      }

      if (!isSelfClosing && !VOID_ELEMENTS.has(tagName)) {
        stack.push(el);
      }
    }
  }
}

function setupMockDom() {
  const body = new MockElement('body');
  const document = {
    body,
    activeElement: null as MockElement | null,
    createElement: (tag: string) => new MockElement(tag),
    getElementById: (id: string) => findFirst(body, `#${id}`),
    querySelector: (sel: string) => findFirst(body, sel),
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      findAll(body, sel, results);
      return results;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  const window = {
    scrollY: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  (globalThis as any).document = document;
  (globalThis as any).window = window;
  (globalThis as any).confirm = vi.fn(() => true);
  (globalThis as any).alert = vi.fn();
}

describe('Phase 7 Step 6 — Frontend Admin & CMS Implementation Test Suite', () => {
  const mockAdminUser = {
    id: 'f87a329d-472b-47e2-8926-ec4836f32810',
    email: 'admin@youngtours.com',
    fullName: 'System Administrator',
    role: 'ADMIN',
    isActive: true,
  };

  const mockCustomerUser = {
    id: 'a12b345c-678d-90ef-1234-567890abcdef',
    email: 'customer@example.com',
    fullName: 'John Customer',
    role: 'CUSTOMER',
    isActive: true,
  };

  const mockDashboardStats = {
    totalPackages: 12,
    publishedPackages: 8,
    draftPackages: 4,
    totalDestinations: 6,
    totalThemes: 4,
    totalDepartures: 24,
    openDepartures: 18,
    upcomingDeparturesCount: 15,
    totalBookings: 45,
    confirmedBookings: 32,
    awaitingPaymentBookings: 8,
    cancelledBookings: 5,
    pendingCancellations: 2,
    inventoryUtilizationPercent: 78.5,
  };

  beforeEach(() => {
    setupMockDom();
    authStore.clearSession();
    AdminConsole.activeTab = 'dashboard';
    AdminConsole.isOpen = false;

    // Build base Navbar DOM
    const nav = (globalThis as any).document.createElement('nav');
    nav.id = 'main-nav';
    nav.className = 'navbar';
    const navLinks = (globalThis as any).document.createElement('ul');
    navLinks.className = 'nav-links';
    nav.appendChild(navLinks);
    (globalThis as any).document.body.appendChild(nav);

    NavbarComponent.init();
    AdminConsole.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // 1. RBAC UI Protection & Route Guards
  // ============================================================
  describe('1. RBAC UI Protection & Guards', () => {
    it('1.1 unauthenticated user cannot access admin console (shows Access Denied)', () => {
      authStore.clearSession();
      AdminConsole.open();

      const modal = (globalThis as any).document.getElementById('admin-console-modal');
      expect(modal).not.toBeNull();
      expect(modal.classList.contains('hidden')).toBe(false);
      expect(modal.innerHTML).toContain('Administrator Privileges Required');
      expect(modal.querySelector('.admin-sidebar')).toBeNull();
    });

    it('1.2 authenticated CUSTOMER cannot access admin console (shows Access Denied)', () => {
      authStore.setSession(mockCustomerUser, 'customer_token_123');
      AdminConsole.open();

      const modal = (globalThis as any).document.getElementById('admin-console-modal');
      expect(modal).not.toBeNull();
      expect(modal.innerHTML).toContain('Administrator Privileges Required');
      expect(modal.querySelector('.admin-sidebar')).toBeNull();
    });

    it('1.3 authenticated ADMIN accesses admin shell with full navigation sidebar', () => {
      authStore.setSession(mockAdminUser, 'admin_token_123');
      AdminConsole.open('dashboard');

      const modal = (globalThis as any).document.getElementById('admin-console-modal');
      expect(modal).not.toBeNull();
      expect(modal.classList.contains('hidden')).toBe(false);
      expect(modal.querySelector('.admin-sidebar')).not.toBeNull();
      expect(modal.querySelector('.admin-main')).not.toBeNull();
      expect(modal.innerHTML).toContain('Young Admin');
      expect(modal.innerHTML).toContain('System Administrator');
    });

    it('1.4 navbar renders Admin Console button ONLY for ADMIN users', () => {
      // Unauthenticated -> No button
      authStore.clearSession();
      expect((globalThis as any).document.querySelector('#nav-admin-console-btn')).toBeNull();

      // Customer -> No button
      authStore.setSession(mockCustomerUser, 'cust_tok');
      expect((globalThis as any).document.querySelector('#nav-admin-console-btn')).toBeNull();

      // Admin -> Button rendered
      authStore.setSession(mockAdminUser, 'admin_tok');
      const adminBtn = (globalThis as any).document.querySelector('#nav-admin-console-btn');
      expect(adminBtn).not.toBeNull();
      expect(adminBtn.textContent).toContain('Admin Console');
    });
  });

  // ============================================================
  // 2. Dashboard Tab
  // ============================================================
  describe('2. Admin Dashboard Tab', () => {
    it('2.1 renders authoritative operational KPI counts from backend', async () => {
      authStore.setSession(mockAdminUser, 'admin_token_123');
      vi.spyOn(api, 'getAdminDashboardStats').mockResolvedValueOnce(mockDashboardStats);

      const container = (globalThis as any).document.createElement('div');
      await AdminDashboardTab.render(container);

      expect(api.getAdminDashboardStats).toHaveBeenCalled();
      expect(container.innerHTML).toContain('12'); // Total packages
      expect(container.innerHTML).toContain('24'); // Total departures
      expect(container.innerHTML).toContain('45'); // Total bookings
      expect(container.innerHTML).toContain('78.5%'); // Utilization
      expect(container.innerHTML).toContain('2'); // Pending cancellations
    });

    it('2.2 strictly does NOT display fabricated revenue metrics', async () => {
      authStore.setSession(mockAdminUser, 'admin_token_123');
      vi.spyOn(api, 'getAdminDashboardStats').mockResolvedValueOnce(mockDashboardStats);

      const container = (globalThis as any).document.createElement('div');
      await AdminDashboardTab.render(container);

      const html = container.innerHTML.toLowerCase();
      expect(html).not.toContain('total revenue');
      expect(html).not.toContain('gross revenue');
      expect(html).not.toContain('forecast');
      expect(html).not.toContain('lifetime value');
    });

    it('2.3 handles dashboard API failure with clear error state and retry option', async () => {
      authStore.setSession(mockAdminUser, 'admin_token_123');
      vi.spyOn(api, 'getAdminDashboardStats').mockRejectedValueOnce(
        new Error('Operational stats query timed out'),
      );

      const container = (globalThis as any).document.createElement('div');
      await AdminDashboardTab.render(container);

      expect(container.innerHTML).toContain('Failed to load dashboard metrics');
      expect(container.innerHTML).toContain('Operational stats query timed out');
      expect(container.querySelector('#admin-dashboard-retry-btn')).not.toBeNull();
    });
  });

  // ============================================================
  // 3. Hero Sliders Tab
  // ============================================================
  describe('3. Hero Slider Management Tab', () => {
    const mockSliders = [
      {
        id: 'slider-1-uuid',
        title: 'Discover Kashmir',
        subtitle: 'Paradise on Earth',
        imageUrl: 'https://images.unsplash.com/kashmir.jpg',
        ctaLabel: 'Explore Tours',
        ctaUrl: '#packages',
        sortOrder: 1,
        isActive: true,
      },
    ];

    it('3.1 renders hero sliders table', async () => {
      vi.spyOn(api, 'getAdminHeroSliders').mockResolvedValueOnce(mockSliders);

      const container = (globalThis as any).document.createElement('div');
      await AdminSlidersTab.render(container);

      expect(api.getAdminHeroSliders).toHaveBeenCalled();
      expect(container.innerHTML).toContain('Discover Kashmir');
      expect(container.innerHTML).toContain('Paradise on Earth');
      expect(container.innerHTML).toContain('Active');
    });

    it('3.2 creates new hero slider with validated fields', async () => {
      vi.spyOn(api, 'getAdminHeroSliders').mockResolvedValue(mockSliders);
      const createSpy = vi.spyOn(api, 'createAdminHeroSlider').mockResolvedValueOnce({
        id: 'new-slider-uuid',
        title: 'Majestic Ladakh',
        imageUrl: 'https://images.unsplash.com/ladakh.jpg',
        sortOrder: 2,
        isActive: true,
      } as any);

      const container = (globalThis as any).document.createElement('div');
      await AdminSlidersTab.render(container);

      AdminSlidersTab.openFormModal(container, null);
      const modal = container.querySelector('#admin-slider-form-modal');
      expect(modal).not.toBeNull();

      const titleInput = modal!.querySelector('#slider-title') as MockElement;
      const urlInput = modal!.querySelector('#slider-image-url') as MockElement;
      titleInput.value = 'Majestic Ladakh';
      urlInput.value = 'https://images.unsplash.com/ladakh.jpg';

      const form = modal!.querySelector('#admin-slider-form');
      await form!.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Majestic Ladakh',
          imageUrl: 'https://images.unsplash.com/ladakh.jpg',
        }),
      );
    });
  });

  // ============================================================
  // 4. CMS Pages Tab & Safe Content Handling
  // ============================================================
  describe('4. CMS Pages Tab & Safe Content Handling', () => {
    const mockPages = [
      {
        id: 'page-1-uuid',
        slug: 'terms-and-conditions',
        title: 'Terms & Conditions',
        metaDescription: 'Young Tours terms and rules',
        contentHtml: '<h1>Terms</h1><script>alert("xss")</script><p>Terms body</p>',
        isPublished: true,
        updatedAt: '2026-09-30T10:00:00.000Z',
      },
    ];

    it('4.1 renders CMS pages list table with slug badge', async () => {
      vi.spyOn(api, 'getAdminCmsPages').mockResolvedValueOnce(mockPages);

      const container = (globalThis as any).document.createElement('div');
      await AdminPagesTab.render(container);

      expect(api.getAdminCmsPages).toHaveBeenCalled();
      expect(container.innerHTML).toContain('Terms &amp; Conditions');
      expect(container.innerHTML).toContain('/pages/terms-and-conditions');
    });

    it('4.2 CRITICAL SECURITY TEST: CMS content_html is edited via textarea and never raw injected into DOM', async () => {
      vi.spyOn(api, 'getAdminCmsPages').mockResolvedValueOnce(mockPages);

      const container = (globalThis as any).document.createElement('div');
      await AdminPagesTab.render(container);

      AdminPagesTab.openFormModal(container, mockPages[0]!);
      const modal = container.querySelector('#admin-page-form-modal');
      expect(modal).not.toBeNull();

      const textarea = modal!.querySelector('#cms-page-content');
      expect(textarea).not.toBeNull();
      expect(textarea!.tagName).toBe('TEXTAREA');
      // Content is in textarea, not executed as script
      expect(modal!.querySelector('script')).toBeNull();
    });

    it('4.3 updates CMS page by ID with validated slug format', async () => {
      vi.spyOn(api, 'getAdminCmsPages').mockResolvedValue(mockPages);
      const updateSpy = vi
        .spyOn(api, 'updateAdminCmsPage')
        .mockResolvedValueOnce(mockPages[0] as any);

      const container = (globalThis as any).document.createElement('div');
      await AdminPagesTab.render(container);

      AdminPagesTab.openFormModal(container, mockPages[0]!);
      const modal = container.querySelector('#admin-page-form-modal');
      const titleInput = modal!.querySelector('#cms-page-title') as MockElement;
      titleInput.value = 'Updated Terms & Policies';

      const form = modal!.querySelector('#admin-page-form');
      await form!.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(updateSpy).toHaveBeenCalledWith(
        'page-1-uuid',
        expect.objectContaining({
          title: 'Updated Terms & Policies',
          slug: 'terms-and-conditions',
        }),
      );
    });
  });

  // ============================================================
  // 5. Package Management Tab
  // ============================================================
  describe('5. Tour Package Management Tab', () => {
    const mockPackages = [
      {
        id: 'pkg-1-uuid',
        title: 'Kashmir Classic 6D/5N',
        slug: 'kashmir-classic',
        originCity: 'Srinagar',
        destinationCity: 'Gulmarg',
        durationDays: 6,
        durationNights: 5,
        baseAdultPrice: 3500000,
        currency: 'INR',
        isPublished: true,
        isFeatured: true,
        itinerary: [{ dayNumber: 1, title: 'Arrival', activityDescription: 'Check-in' }],
      },
    ];

    it('5.1 renders package table with price formatted and publish badge', async () => {
      vi.spyOn(api, 'getAdminPackages').mockResolvedValueOnce(mockPackages);

      const container = (globalThis as any).document.createElement('div');
      await AdminPackagesTab.render(container);

      expect(container.innerHTML).toContain('Kashmir Classic 6D/5N');
      expect(container.innerHTML).toContain('₹35,000');
      expect(container.innerHTML).toContain('Published');
      expect(container.innerHTML).toContain('1 Days Itinerary');
    });

    it('5.2 publish and unpublish actions call respective admin APIs', async () => {
      vi.spyOn(api, 'getAdminPackages').mockResolvedValue(mockPackages);
      const unpubSpy = vi.spyOn(api, 'unpublishAdminPackage').mockResolvedValueOnce({} as any);

      const container = (globalThis as any).document.createElement('div');
      await AdminPackagesTab.render(container);

      const unpubBtn = container.querySelector('.btn-unpublish-pkg');
      expect(unpubBtn).not.toBeNull();
      await unpubBtn!.dispatchEvent({ type: 'click' });

      expect(unpubSpy).toHaveBeenCalledWith('pkg-1-uuid');
    });
  });

  // ============================================================
  // 6. Departures & Manifest Tab
  // ============================================================
  describe('6. Departure & Capacity Management Tab', () => {
    const mockDepartures = [
      {
        id: 'dep-1-uuid',
        packageId: 'pkg-1-uuid',
        departureDate: '2026-10-15',
        returnDate: '2026-10-21',
        totalSeatCapacity: 20,
        bookedSeats: 15,
        status: 'OPEN',
        priceOverrideAdult: null,
      },
    ];

    it('6.1 renders departure schedule with backend-calculated seat availability', async () => {
      vi.spyOn(api, 'getAdminPackages').mockResolvedValue([
        { id: 'pkg-1-uuid', title: 'Kashmir Tour' },
      ]);
      vi.spyOn(api, 'getAdminPackageDepartures').mockResolvedValue(mockDepartures);

      const container = (globalThis as any).document.createElement('div');
      await AdminInventoryTab.render(container);

      expect(container.innerHTML).toContain('2026-10-15');
      expect(container.innerHTML).toContain('20 seats');
      expect(container.innerHTML).toContain('5 seats left');
      expect(container.innerHTML).toContain('OPEN');
    });

    it('6.2 opens and displays confirmed passenger manifest', async () => {
      const mockManifest = [
        {
          fullName: 'Alice Traveller',
          passengerType: 'ADULT',
          ageAtBooking: 29,
          gender: 'FEMALE',
          bookingReference: 'BK-202610-ABCD',
          isPrimaryContact: true,
          specialRequests: 'Window seat preference',
        },
      ];
      vi.spyOn(api, 'getAdminPackages').mockResolvedValue([
        { id: 'pkg-1-uuid', title: 'Kashmir Tour' },
      ]);
      vi.spyOn(api, 'getAdminPackageDepartures').mockResolvedValue(mockDepartures);
      vi.spyOn(api, 'getAdminDepartureManifest').mockResolvedValue(mockManifest);

      const container = (globalThis as any).document.createElement('div');
      await AdminInventoryTab.render(container);
      await AdminInventoryTab.openManifestModal(container, 'dep-1-uuid');

      expect(api.getAdminDepartureManifest).toHaveBeenCalledWith('dep-1-uuid');
      expect(container.innerHTML).toContain('Confirmed Passenger Manifest');
      expect(container.innerHTML).toContain('Alice Traveller');
      expect(container.innerHTML).toContain('BK-202610-ABCD');
      expect(container.innerHTML).toContain('Window seat preference');
    });
  });

  // ============================================================
  // 7. Booking Operations Tab
  // ============================================================
  describe('7. Booking Operations Tab', () => {
    const mockBookings = [
      {
        id: 'bkg-1-uuid',
        bookingReference: 'BK-202610-9988',
        status: 'CONFIRMED',
        totalPrice: 7000000,
        partySize: 2,
        adultCount: 2,
        childCount: 0,
        primaryContact: {
          name: 'Sarah Connor',
          email: 'sarah@example.com',
          phone: '+919876543210',
        },
        packageSnapshot: {
          title: 'Royal Rajasthan',
        },
        departureSnapshot: {
          departureDate: '2026-11-01',
        },
        createdAt: '2026-09-30T10:00:00.000Z',
      },
    ];

    it('7.1 renders bookings list with canonical status badges', async () => {
      vi.spyOn(api, 'getAdminBookings').mockResolvedValueOnce(mockBookings);

      const container = (globalThis as any).document.createElement('div');
      await AdminBookingsTab.render(container);

      expect(container.innerHTML).toContain('BK-202610-9988');
      expect(container.innerHTML).toContain('Sarah Connor');
      expect(container.innerHTML).toContain('Royal Rajasthan');
      expect(container.innerHTML).toContain('CONFIRMED');
      expect(container.innerHTML).toContain('₹70,000');
    });
  });

  // ============================================================
  // 8. Cancellation Review & Refund Operations Tab
  // ============================================================
  describe('8. Cancellation Review & Refund Operations Tab', () => {
    const mockCancellations = [
      {
        id: 'cancel-1-uuid',
        bookingReference: 'BK-202610-9988',
        cancellationReason: 'Medical emergency',
        calculatedRefundAmount: 5600000,
        calculatedPenaltyAmount: 1400000,
        status: 'PENDING_APPROVAL',
        createdAt: '2026-09-30T11:00:00.000Z',
      },
    ];

    it('8.1 renders cancellation review queue with refund breakdown', async () => {
      vi.spyOn(api, 'getAdminCancellations').mockResolvedValueOnce(mockCancellations);

      const container = (globalThis as any).document.createElement('div');
      await AdminCancellationsTab.render(container);

      expect(container.innerHTML).toContain('BK-202610-9988');
      expect(container.innerHTML).toContain('Medical emergency');
      expect(container.innerHTML).toContain('₹56,000');
      expect(container.innerHTML).toContain('₹14,000');
      expect(container.innerHTML).toContain('PENDING_APPROVAL');
    });

    it('8.2 authorizes cancellation refund and transitions request', async () => {
      vi.spyOn(api, 'getAdminCancellations').mockResolvedValue(mockCancellations);
      const authSpy = vi.spyOn(api, 'authorizeAdminCancellation').mockResolvedValueOnce({
        id: 'cancel-1-uuid',
        status: 'APPROVED',
      } as any);

      const container = (globalThis as any).document.createElement('div');
      await AdminCancellationsTab.render(container);

      AdminCancellationsTab.openDecisionModal(
        container,
        'cancel-1-uuid',
        'BK-202610-9988',
        5600000,
        'AUTHORIZE',
      );

      const modal = container.querySelector('#admin-cancel-action-modal');
      const notes = modal!.querySelector('#admin-decision-notes') as MockElement;
      notes.value = 'Approved as per medical policy';

      const form = modal!.querySelector('#admin-decision-form');
      await form!.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(authSpy).toHaveBeenCalledWith(
        'cancel-1-uuid',
        expect.objectContaining({
          adminNotes: 'Approved as per medical policy',
        }),
      );
    });
  });

  // ============================================================
  // 9. Read-Only Audit Logs Tab
  // ============================================================
  describe('9. Read-Only Audit Logs Tab', () => {
    const mockAuditLogs = [
      {
        id: 'audit-1-uuid',
        adminId: mockAdminUser.id,
        action: 'PACKAGE_PUBLISH',
        entityType: 'tour_packages',
        entityId: 'pkg-1-uuid',
        details: { previousStatus: false, newStatus: true },
        ipAddress: '127.0.0.1',
        createdAt: '2026-09-30T12:00:00.000Z',
      },
    ];

    it('9.1 renders append-only audit trail and details inspector', async () => {
      vi.spyOn(api, 'getAdminAuditLogs').mockResolvedValueOnce(mockAuditLogs);

      const container = (globalThis as any).document.createElement('div');
      await AdminAuditTab.render(container);

      expect(container.innerHTML).toContain('PACKAGE_PUBLISH');
      expect(container.innerHTML).toContain('tour_packages');
      expect(container.innerHTML).toContain('127.0.0.1');
    });

    it('9.2 strictly enforces immutability (NO create, edit, or delete buttons)', async () => {
      vi.spyOn(api, 'getAdminAuditLogs').mockResolvedValueOnce(mockAuditLogs);

      const container = (globalThis as any).document.createElement('div');
      await AdminAuditTab.render(container);

      const html = container.innerHTML.toLowerCase();
      expect(html).not.toContain('delete');
      expect(html).not.toContain('edit');
      expect(html).not.toContain('+ new audit');
    });
  });
});
