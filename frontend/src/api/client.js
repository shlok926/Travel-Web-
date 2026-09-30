import { config } from '../config.js';
import { authStore } from '../state/auth.js';

/**
 * Standard API Client with in-memory Bearer token injection,
 * automatic 401 refresh rotation retry, and session restoration.
 */
export class ApiClient {
  constructor(baseUrl = config.apiBaseUrl, store = authStore) {
    this.baseUrl = baseUrl;
    this.store = store;
    this.refreshPromise = null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    // Attach in-memory access token if available and not skipped
    const token = this.store.getAccessToken();
    if (token && !options.skipAuth && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
      ...options,
      headers,
      credentials: options.credentials || 'include',
    };

    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 Unauthorized with single token refresh retry
      if (
        response.status === 401 &&
        options.retry !== false &&
        !endpoint.includes('/auth/refresh') &&
        !endpoint.includes('/auth/login') &&
        !endpoint.includes('/auth/register')
      ) {
        try {
          await this.refreshSession();
          // Retry the original request exactly once with rotated token
          return await this.request(endpoint, {
            ...options,
            retry: false,
          });
        } catch (refreshErr) {
          this.store.clearSession();
          throw refreshErr;
        }
      }

      let json;
      try {
        json = await response.json();
      } catch {
        json = null;
      }

      if (!response.ok || !json?.success) {
        const errorMsg =
          json?.error?.message || `HTTP Error ${response.status}: ${response.statusText}`;
        const error = new Error(errorMsg);
        error.status = response.status;
        error.code = json?.error?.code;
        error.details = json?.error?.details || [];
        throw error;
      }

      if (options.includeMeta) {
        return { data: json.data, meta: json.meta };
      }

      return json.data;
    } catch (err) {
      if (!options.silent) {
        // eslint-disable-next-line no-console
        console.error(`[API Client Error] ${options.method || 'GET'} ${url}:`, err);
      }
      throw err;
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  // --- Programmatic Authentication API ---

  async register(data) {
    const response = await this.post('/auth/register', data, {
      skipAuth: true,
      retry: false,
    });
    this.store.setSession(response.user, response.accessToken);
    return response;
  }

  async login(credentials) {
    const response = await this.post('/auth/login', credentials, {
      skipAuth: true,
      retry: false,
    });
    this.store.setSession(response.user, response.accessToken);
    return response;
  }

  async refreshSession() {
    // Shared promise concurrency guard prevents duplicate refresh storms
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await this.post('/auth/refresh', undefined, {
          skipAuth: true,
          retry: false,
          silent: true,
        });
        this.store.setSession(response.user, response.accessToken);
        return response;
      } catch (err) {
        this.store.clearSession();
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async restoreSession() {
    this.store.setRestoring();
    try {
      const response = await this.refreshSession();
      return response;
    } catch {
      this.store.clearSession();
      return null;
    }
  }

  async logout() {
    try {
      await this.post('/auth/logout', undefined, {
        skipAuth: true,
        retry: false,
        silent: true,
      });
    } finally {
      this.store.clearSession();
    }
  }

  async getCurrentUser() {
    const response = await this.get('/auth/me');
    return response.user;
  }

  async checkHealth() {
    return this.get('/health', { skipAuth: true });
  }

  // --- Public Catalogue & Search APIs ---

  async getDestinations(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.isFeatured !== undefined) query.set('isFeatured', String(params.isFeatured));
    const qs = query.toString();
    return this.get(`/destinations${qs ? `?${qs}` : ''}`, { skipAuth: true });
  }

  async getDestinationBySlug(slug) {
    if (!slug) throw new Error('Destination slug is required');
    return this.get(`/destinations/${encodeURIComponent(slug)}`, { skipAuth: true });
  }

  async getThemes() {
    return this.get('/themes', { skipAuth: true });
  }

  async getPackages(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.destinationSlug) query.set('destinationSlug', String(params.destinationSlug));
    if (params.themeSlug) query.set('themeSlug', String(params.themeSlug));
    if (params.isFeatured !== undefined) query.set('isFeatured', String(params.isFeatured));
    const qs = query.toString();
    return this.get(`/packages${qs ? `?${qs}` : ''}`, { skipAuth: true });
  }

  async getPackageBySlug(slug) {
    if (!slug) throw new Error('Package slug is required');
    return this.get(`/packages/${encodeURIComponent(slug)}`, { skipAuth: true });
  }

  // --- Phase 4 Search, Departure & Availability APIs ---

  async searchPackages(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set('q', String(params.q).trim());
    if (params.destinationSlug) query.set('destinationSlug', String(params.destinationSlug).trim());
    if (params.themeSlug) query.set('themeSlug', String(params.themeSlug).trim());
    if (
      params.minDuration !== undefined &&
      params.minDuration !== null &&
      params.minDuration !== ''
    ) {
      query.set('minDuration', String(params.minDuration));
    }
    if (
      params.maxDuration !== undefined &&
      params.maxDuration !== null &&
      params.maxDuration !== ''
    ) {
      query.set('maxDuration', String(params.maxDuration));
    }
    if (params.maxPrice !== undefined && params.maxPrice !== null && params.maxPrice !== '') {
      query.set('maxPrice', String(params.maxPrice));
    }
    if (params.minPrice !== undefined && params.minPrice !== null && params.minPrice !== '') {
      query.set('minPrice', String(params.minPrice));
    }
    if (params.currency) query.set('currency', String(params.currency));
    if (params.departureDateFrom) query.set('departureDateFrom', String(params.departureDateFrom));
    if (params.departureDateTo) query.set('departureDateTo', String(params.departureDateTo));
    if (params.isFeatured !== undefined && params.isFeatured !== null && params.isFeatured !== '') {
      query.set('isFeatured', String(params.isFeatured));
    }
    if (params.sortBy) query.set('sortBy', String(params.sortBy));
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    const qs = query.toString();
    const endpoint = `/packages/search${qs ? `?${qs}` : ''}`;
    const result = await this.get(endpoint, {
      skipAuth: true,
      includeMeta: true,
      ...options,
    });
    return {
      items: Array.isArray(result?.data) ? result.data : [],
      pagination: result?.meta || {
        page: Number(params.page) || 1,
        limit: Number(params.limit) || 12,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  async getPackageDepartures(slug, options = {}) {
    if (!slug) throw new Error('Package slug is required');
    return this.get(`/packages/${encodeURIComponent(slug)}/departures`, {
      skipAuth: true,
      ...options,
    });
  }

  async getDepartureAvailability(departureId, params = {}, options = {}) {
    if (!departureId) throw new Error('Departure ID is required');
    const query = new URLSearchParams();
    if (params.partySize) query.set('partySize', String(params.partySize));
    const qs = query.toString();
    return this.get(
      `/departures/${encodeURIComponent(departureId)}/availability${qs ? `?${qs}` : ''}`,
      {
        skipAuth: true,
        ...options,
      },
    );
  }

  // --- Phase 5 Customer Booking APIs ---

  async createBooking(data, idempotencyKey = null, options = {}) {
    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }));

    const headers = {
      'idempotency-key': key,
      ...(options.headers || {}),
    };

    return this.post('/bookings', data, {
      ...options,
      headers,
      includeMeta: true,
    });
  }

  async getMyBookings(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status) query.set('status', String(params.status));
    const qs = query.toString();
    return this.get(`/bookings${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async getBookingByReference(reference, options = {}) {
    if (!reference) throw new Error('Booking reference is required');
    return this.get(`/bookings/${encodeURIComponent(reference)}`, options);
  }

  async cancelBooking(reference, reason = 'Customer requested cancellation', options) {
    if (!reference) throw new Error('Booking reference is required');
    return options
      ? this.requestCancellation(reference, { reason }, options)
      : this.requestCancellation(reference, { reason });
  }

  // --- Phase 6 Payment, Document & Cancellation APIs ---

  /**
   * Initiates payment for a booking in AWAITING_PAYMENT status.
   * @param {{ bookingReference: string, provider?: string }} data
   * @param {string} [idempotencyKey]
   * @param {object} [options]
   */
  async initiatePayment(data, idempotencyKey = null, options = {}) {
    if (!data?.bookingReference) {
      throw new Error('Booking reference is required to initiate payment');
    }

    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }));

    const headers = {
      'idempotency-key': key,
      ...(options.headers || {}),
    };

    return this.post('/payments/initiate', data, {
      ...options,
      headers,
    });
  }

  /**
   * Retrieves payment transaction status for a booking reference.
   * @param {string} bookingReference
   * @param {object} [options]
   */
  async getPaymentStatus(bookingReference, options = {}) {
    if (!bookingReference) throw new Error('Booking reference is required');
    return this.get(`/payments/${encodeURIComponent(bookingReference)}/status`, options);
  }

  /**
   * Customer submits a cancellation request for an eligible CONFIRMED booking.
   * @param {string} bookingReference
   * @param {{ reason: string } | string} data
   * @param {object} [options]
   */
  async requestCancellation(bookingReference, data, options = {}) {
    if (!bookingReference) throw new Error('Booking reference is required');
    const reason = typeof data === 'string' ? data : data?.reason;
    if (!reason) throw new Error('Cancellation reason is required');
    return this.post(
      `/bookings/${encodeURIComponent(bookingReference)}/cancellation`,
      { reason },
      options,
    );
  }

  /**
   * Retrieves cancellation request and refund settlement status for a booking.
   * @param {string} bookingReference
   * @param {object} [options]
   */
  async getCancellationDetails(bookingReference, options = {}) {
    if (!bookingReference) throw new Error('Booking reference is required');
    return this.get(`/bookings/${encodeURIComponent(bookingReference)}/cancellation`, options);
  }

  /**
   * Obtains a secure time-limited presigned download URL for GST Tax Invoice PDF.
   * @param {string} bookingReference
   * @param {object} [options]
   */
  async downloadInvoice(bookingReference, options = {}) {
    if (!bookingReference) throw new Error('Booking reference is required');
    return this.get(`/documents/invoice/${encodeURIComponent(bookingReference)}/download`, options);
  }

  /**
   * Obtains a secure time-limited presigned download URL for E-Ticket Voucher PDF.
   * @param {string} bookingReference
   * @param {object} [options]
   */
  async downloadVoucher(bookingReference, options = {}) {
    if (!bookingReference) throw new Error('Booking reference is required');
    return this.get(`/documents/voucher/${encodeURIComponent(bookingReference)}/download`, options);
  }

  // ============================================================
  // --- Phase 7 Admin & CMS APIs ---
  // ============================================================

  // 1. Admin Dashboard
  async getAdminDashboardStats(options = {}) {
    return this.get('/admin/dashboard/stats', options);
  }

  // 2. Hero Sliders (Public & Admin)
  async getPublicHeroSliders(options = {}) {
    return this.get('/cms/sliders', { skipAuth: true, ...options });
  }

  async getAdminHeroSliders(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.isActive !== undefined && params.isActive !== null && params.isActive !== '') {
      query.set('isActive', String(params.isActive));
    }
    const qs = query.toString();
    return this.get(`/admin/cms/sliders${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async getAdminHeroSliderById(id, options = {}) {
    if (!id) throw new Error('Slider ID is required');
    return this.get(`/admin/cms/sliders/${encodeURIComponent(id)}`, options);
  }

  async createAdminHeroSlider(data, options = {}) {
    return this.post('/admin/cms/sliders', data, options);
  }

  async updateAdminHeroSlider(id, data, options = {}) {
    if (!id) throw new Error('Slider ID is required');
    return this.patch(`/admin/cms/sliders/${encodeURIComponent(id)}`, data, options);
  }

  async deleteAdminHeroSlider(id, options = {}) {
    if (!id) throw new Error('Slider ID is required');
    return this.delete(`/admin/cms/sliders/${encodeURIComponent(id)}`, options);
  }

  // 3. CMS Static Pages (Public & Admin)
  async getPublicCmsPageBySlug(slug, options = {}) {
    if (!slug) throw new Error('Page slug is required');
    return this.get(`/cms/pages/${encodeURIComponent(slug)}`, { skipAuth: true, ...options });
  }

  async getAdminCmsPages(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (
      params.isPublished !== undefined &&
      params.isPublished !== null &&
      params.isPublished !== ''
    ) {
      query.set('isPublished', String(params.isPublished));
    }
    const qs = query.toString();
    return this.get(`/admin/cms/pages${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async getAdminCmsPageById(id, options = {}) {
    if (!id) throw new Error('Page ID is required');
    return this.get(`/admin/cms/pages/id/${encodeURIComponent(id)}`, options);
  }

  async getAdminCmsPageBySlug(slug, options = {}) {
    if (!slug) throw new Error('Page slug is required');
    return this.get(`/admin/cms/pages/${encodeURIComponent(slug)}`, options);
  }

  async createAdminCmsPage(data, options = {}) {
    return this.post('/admin/cms/pages', data, options);
  }

  async updateAdminCmsPage(id, data, options = {}) {
    if (!id) throw new Error('Page ID is required');
    return this.patch(`/admin/cms/pages/${encodeURIComponent(id)}`, data, options);
  }

  async updateAdminCmsPageBySlug(slug, data, options = {}) {
    if (!slug) throw new Error('Page slug is required');
    return this.put(`/admin/cms/pages/${encodeURIComponent(slug)}`, data, options);
  }

  async deleteAdminCmsPage(id, options = {}) {
    if (!id) throw new Error('Page ID is required');
    return this.delete(`/admin/cms/pages/${encodeURIComponent(id)}`, options);
  }

  // 4. Admin Packages & Catalogue
  async getAdminPackages(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.destinationSlug) query.set('destinationSlug', String(params.destinationSlug));
    if (params.themeSlug) query.set('themeSlug', String(params.themeSlug));
    if (
      params.isPublished !== undefined &&
      params.isPublished !== null &&
      params.isPublished !== ''
    ) {
      query.set('isPublished', String(params.isPublished));
    }
    if (params.isFeatured !== undefined && params.isFeatured !== null && params.isFeatured !== '') {
      query.set('isFeatured', String(params.isFeatured));
    }
    const qs = query.toString();
    return this.get(`/admin/packages${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async getAdminPackageById(id, options = {}) {
    if (!id) throw new Error('Package ID is required');
    return this.get(`/admin/packages/${encodeURIComponent(id)}`, options);
  }

  async createAdminPackage(data, options = {}) {
    return this.post('/admin/packages', data, options);
  }

  async updateAdminPackage(id, data, options = {}) {
    if (!id) throw new Error('Package ID is required');
    return this.patch(`/admin/packages/${encodeURIComponent(id)}`, data, options);
  }

  async deleteAdminPackage(id, options = {}) {
    if (!id) throw new Error('Package ID is required');
    return this.delete(`/admin/packages/${encodeURIComponent(id)}`, options);
  }

  async publishAdminPackage(id, options = {}) {
    if (!id) throw new Error('Package ID is required');
    return this.post(`/admin/packages/${encodeURIComponent(id)}/publish`, undefined, options);
  }

  async unpublishAdminPackage(id, options = {}) {
    if (!id) throw new Error('Package ID is required');
    return this.post(`/admin/packages/${encodeURIComponent(id)}/unpublish`, undefined, options);
  }

  async setAdminPackageItinerary(id, data, options = {}) {
    if (!id) throw new Error('Package ID is required');
    return this.put(`/admin/packages/${encodeURIComponent(id)}/itinerary`, data, options);
  }

  async getAdminDestinations(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.get(`/admin/destinations${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async getAdminThemes(options = {}) {
    return this.get('/admin/themes', options);
  }

  // 5. Admin Departures & Schedules
  async getAdminPackageDepartures(packageId, options = {}) {
    if (!packageId) throw new Error('Package ID is required');
    return this.get(`/admin/packages/${encodeURIComponent(packageId)}/departures`, options);
  }

  async createAdminDeparture(packageId, data, options = {}) {
    if (!packageId) throw new Error('Package ID is required');
    return this.post(`/admin/packages/${encodeURIComponent(packageId)}/departures`, data, options);
  }

  async getAdminDepartureById(id, options = {}) {
    if (!id) throw new Error('Departure ID is required');
    return this.get(`/admin/departures/${encodeURIComponent(id)}`, options);
  }

  async updateAdminDeparture(id, data, options = {}) {
    if (!id) throw new Error('Departure ID is required');
    return this.patch(`/admin/departures/${encodeURIComponent(id)}`, data, options);
  }

  async deleteAdminDeparture(id, options = {}) {
    if (!id) throw new Error('Departure ID is required');
    return this.delete(`/admin/departures/${encodeURIComponent(id)}`, options);
  }

  // 6. Admin Bookings & Manifest
  async getAdminBookings(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status) query.set('status', String(params.status));
    if (params.departureId) query.set('departureId', String(params.departureId));
    if (params.customerId) query.set('customerId', String(params.customerId));
    if (params.search) query.set('search', String(params.search));
    const qs = query.toString();
    return this.get(`/admin/bookings${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async getAdminBookingByReference(reference, options = {}) {
    if (!reference) throw new Error('Booking reference is required');
    return this.get(`/admin/bookings/${encodeURIComponent(reference)}`, options);
  }

  async getAdminDepartureManifest(departureId, options = {}) {
    if (!departureId) throw new Error('Departure ID is required');
    return this.get(`/admin/departures/${encodeURIComponent(departureId)}/manifest`, options);
  }

  // 7. Admin Cancellation Queue & Operations
  async getAdminCancellations(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status) query.set('status', String(params.status));
    const qs = query.toString();
    return this.get(`/admin/cancellations${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async authorizeAdminCancellation(cancellationId, data = {}, options = {}) {
    if (!cancellationId) throw new Error('Cancellation ID is required');
    return this.post(
      `/admin/cancellations/${encodeURIComponent(cancellationId)}/authorize`,
      data,
      options,
    );
  }

  async rejectAdminCancellation(cancellationId, data = {}, options = {}) {
    if (!cancellationId) throw new Error('Cancellation ID is required');
    return this.post(
      `/admin/cancellations/${encodeURIComponent(cancellationId)}/reject`,
      data,
      options,
    );
  }

  // 8. Admin Audit Logs
  async getAdminAuditLogs(params = {}, options = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.adminId) query.set('adminId', String(params.adminId));
    if (params.action) query.set('action', String(params.action));
    if (params.entityType) query.set('entityType', String(params.entityType));
    if (params.entityId) query.set('entityId', String(params.entityId));
    if (params.dateFrom) query.set('dateFrom', String(params.dateFrom));
    if (params.dateTo) query.set('dateTo', String(params.dateTo));
    const qs = query.toString();
    return this.get(`/admin/audit-logs${qs ? `?${qs}` : ''}`, {
      includeMeta: true,
      ...options,
    });
  }

  async getAdminAuditLogById(id, options = {}) {
    if (!id) throw new Error('Audit log ID is required');
    return this.get(`/admin/audit-logs/${encodeURIComponent(id)}`, options);
  }
}

export const api = new ApiClient();
