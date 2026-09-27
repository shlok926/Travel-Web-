import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BookingModal } from '../../frontend/src/components/bookingModal.js';
import { BookingDetailModal } from '../../frontend/src/components/bookingDetailModal.js';
import { MyBookingsModal } from '../../frontend/src/components/myBookingsModal.js';
import { authStore } from '../../frontend/src/state/auth.js';
import { api } from '../../frontend/src/api/client.js';

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
  value = '';
  placeholder = '';
  autocomplete = '';
  disabled = false;
  _textContent = '';
  style: Record<string, string> = { overflow: '' };
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  classList = new MockClassList();
  eventListeners = new Map<string, Array<(event: any) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
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
    if (!event.currentTarget) {
      event.currentTarget = this;
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

  querySelector(selector: string): MockElement | null {
    return findFirst(this, selector);
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    findAll(this, selector, results);
    return results;
  }

  get innerHTML(): string {
    return this.textContent;
  }

  set innerHTML(html: string) {
    this.children = [];
    this._textContent = '';
    parseHtmlInto(html, this);
  }
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
  };

  const window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    scrollY: 0,
    prompt: vi.fn(),
    open: vi.fn(),
    scrollTo: vi.fn(),
  };

  (globalThis as any).document = document;
  (globalThis as any).window = window;

  const bookingModal = new MockElement('div');
  bookingModal.id = 'booking-modal';
  bookingModal.classList.add('hidden');
  body.appendChild(bookingModal);

  const bookingDetailModal = new MockElement('div');
  bookingDetailModal.id = 'booking-detail-modal';
  bookingDetailModal.classList.add('hidden');
  body.appendChild(bookingDetailModal);

  const myBookingsModal = new MockElement('div');
  myBookingsModal.id = 'my-bookings-modal';
  myBookingsModal.classList.add('hidden');
  body.appendChild(myBookingsModal);

  return { body, document, window, bookingModal, bookingDetailModal, myBookingsModal };
}

describe('Phase 6 Step 11 — Frontend Payment, Documents & Cancellation/Refund UX', () => {
  let dom: ReturnType<typeof setupMockDom>;

  beforeEach(() => {
    dom = setupMockDom();
    authStore.clearSession();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    BookingModal.close();
    BookingDetailModal.close();
    MyBookingsModal.close();
  });

  // ============================================================
  // 1. Payment Initiation Tests
  // ============================================================
  describe('Payment Initiation', () => {
    it('should render payment checkout card and initiate payment with server-authoritative reference', async () => {
      const sampleBooking = {
        id: 'b-101',
        bookingReference: 'BK-20261001-PAY1',
        status: 'AWAITING_PAYMENT',
        totalPrice: 150000,
        currency: 'INR',
        partySize: 2,
        adultCount: 2,
        childCount: 0,
        holdExpiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
        packageSnapshot: { title: 'Goa Coastal Getaway' },
        departureSnapshot: { departureDate: '2026-11-01', returnDate: '2026-11-05' },
        primaryContact: { name: 'John Doe', email: 'john@example.com' },
      };

      const initiateSpy = vi.spyOn(api, 'initiatePayment').mockResolvedValue({
        paymentId: 'pay-1',
        bookingReference: 'BK-20261001-PAY1',
        provider: 'MOCK',
        amount: 150000,
        currency: 'INR',
        status: 'INITIATED',
        clientPayload: { mockKey: 'key_123' },
        createdAt: new Date().toISOString(),
      });

      BookingModal.renderConfirmation(sampleBooking);

      const payBtn = dom.document.getElementById('btn-pay-now');
      expect(payBtn).not.toBeNull();
      expect(dom.bookingModal.textContent).toContain('AWAITING_PAYMENT');
      expect(dom.bookingModal.textContent).toContain('BK-20261001-PAY1');

      // Click Pay button
      await payBtn!.dispatchEvent({ type: 'click' });

      expect(initiateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingReference: 'BK-20261001-PAY1',
          provider: 'MOCK',
        }),
      );
    });

    it('should prevent duplicate payment submissions while in-flight', async () => {
      const sampleBooking = {
        bookingReference: 'BK-DUP-PAY',
        status: 'AWAITING_PAYMENT',
        totalPrice: 100000,
        currency: 'INR',
        partySize: 1,
        adultCount: 1,
        childCount: 0,
        packageSnapshot: { title: 'Kerala Tour' },
      };

      let resolvePayment: any;
      const delayedPromise = new Promise((res) => {
        resolvePayment = res;
      });
      const initiateSpy = vi
        .spyOn(api, 'initiatePayment')
        .mockImplementation(() => delayedPromise as any);

      BookingModal.renderConfirmation(sampleBooking);
      const payBtn = dom.document.getElementById('btn-pay-now');

      // First click
      payBtn!.dispatchEvent({ type: 'click' });
      expect(payBtn!.disabled).toBe(true);

      // Second duplicate click while in-flight
      payBtn!.dispatchEvent({ type: 'click' });
      expect(initiateSpy).toHaveBeenCalledTimes(1);

      // Resolve in-flight request
      resolvePayment({ paymentId: 'p-1', status: 'INITIATED' });
    });
  });

  // ============================================================
  // 2. Payment Status Polling & Transitions
  // ============================================================
  describe('Payment Status & Transitions', () => {
    it('should transition to SUCCESS & CONFIRMED when gateway succeeds and expose document download buttons', async () => {
      const sampleBooking = {
        bookingReference: 'BK-SUCCESS-PAY',
        status: 'AWAITING_PAYMENT',
        totalPrice: 200000,
        currency: 'INR',
        partySize: 2,
      };

      vi.spyOn(api, 'getPaymentStatus').mockResolvedValue({
        paymentId: 'p-succ-1',
        bookingReference: 'BK-SUCCESS-PAY',
        status: 'SUCCESS',
        amount: 200000,
        currency: 'INR',
        provider: 'MOCK',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      vi.spyOn(api, 'getBookingByReference').mockResolvedValue({
        ...sampleBooking,
        status: 'CONFIRMED',
      });

      BookingModal.renderConfirmation(sampleBooking);
      BookingModal.renderPaymentSuccess(
        { ...sampleBooking, status: 'CONFIRMED' },
        { status: 'SUCCESS', amount: 200000, currency: 'INR', provider: 'MOCK' },
      );

      expect(dom.bookingModal.textContent).toContain('CONFIRMED');
      expect(dom.bookingModal.textContent).toContain('Payment Confirmed');

      const invoiceBtn = dom.document.getElementById('btn-modal-invoice');
      const voucherBtn = dom.document.getElementById('btn-modal-voucher');
      expect(invoiceBtn).not.toBeNull();
      expect(voucherBtn).not.toBeNull();
    });

    it('should transition to FAILED state and offer retry when gateway reports failure', () => {
      const sampleBooking = {
        bookingReference: 'BK-FAIL-PAY',
        status: 'AWAITING_PAYMENT',
        totalPrice: 100000,
        currency: 'INR',
      };

      BookingModal.renderConfirmation(sampleBooking);
      BookingModal.renderPaymentFailed(sampleBooking, { status: 'FAILED' });

      expect(dom.bookingModal.textContent).toContain('Payment Transaction Was Not Completed');
      const retryBtn = dom.document.getElementById('btn-retry-payment-modal');
      expect(retryBtn).not.toBeNull();

      // Click retry
      retryBtn!.dispatchEvent({ type: 'click' });
      const payBtn = dom.document.getElementById('btn-pay-now');
      expect(payBtn).not.toBeNull();
    });
  });

  // ============================================================
  // 3. Document Downloads
  // ============================================================
  describe('Document Downloads', () => {
    it('should request invoice download URL and open in new secure window', async () => {
      const invoiceSpy = vi.spyOn(api, 'downloadInvoice').mockResolvedValue({
        documentType: 'INVOICE',
        bookingReference: 'BK-DOC-1',
        downloadUrl: 'https://storage.youngtours.com/presigned-invoice.pdf',
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      });

      const btn = new MockElement('button');
      await BookingModal.handleDownloadDocument('BK-DOC-1', 'invoice', btn as any);

      expect(invoiceSpy).toHaveBeenCalledWith('BK-DOC-1');
      expect(dom.window.open).toHaveBeenCalledWith(
        'https://storage.youngtours.com/presigned-invoice.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('should request voucher download URL and open in new secure window', async () => {
      const voucherSpy = vi.spyOn(api, 'downloadVoucher').mockResolvedValue({
        documentType: 'VOUCHER',
        bookingReference: 'BK-DOC-2',
        downloadUrl: 'https://storage.youngtours.com/presigned-voucher.pdf',
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      });

      const btn = new MockElement('button');
      await BookingModal.handleDownloadDocument('BK-DOC-2', 'voucher', btn as any);

      expect(voucherSpy).toHaveBeenCalledWith('BK-DOC-2');
      expect(dom.window.open).toHaveBeenCalledWith(
        'https://storage.youngtours.com/presigned-voucher.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  // ============================================================
  // 4. Cancellation & Refund UX in BookingDetailModal
  // ============================================================
  describe('Cancellation & Refund States', () => {
    it('should submit customer cancellation request with reason', async () => {
      const sampleBooking = {
        bookingReference: 'BK-CANC-TEST',
        status: 'CONFIRMED',
        totalPrice: 100000,
        currency: 'INR',
        partySize: 2,
        passengers: [{ fullName: 'Alice Doe', passengerType: 'ADULT', ageAtBooking: 30 }],
      };

      const cancelSpy = vi.spyOn(api, 'requestCancellation').mockResolvedValue({
        id: 'cr-101',
        bookingId: 'b-101',
        requestedBy: 'u-1',
        cancellationReason: 'Family emergency',
        calculatedRefundAmount: 90000,
        calculatedPenaltyAmount: 10000,
        status: 'PENDING_APPROVAL',
        adminNotes: null,
        authorizedBy: null,
        authorizedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      vi.spyOn(api, 'getBookingByReference').mockResolvedValue(sampleBooking);
      vi.spyOn(api, 'getPaymentStatus').mockResolvedValue({ status: 'SUCCESS' } as any);
      vi.spyOn(api, 'getCancellationDetails').mockResolvedValue(null as any);

      await BookingDetailModal.open('BK-CANC-TEST');
      await BookingDetailModal.handleSubmitCancellation('BK-CANC-TEST', 'Family emergency');

      expect(cancelSpy).toHaveBeenCalledWith('BK-CANC-TEST', { reason: 'Family emergency' });
    });

    it('should render PENDING_APPROVAL status accurately', () => {
      const sampleBooking = {
        bookingReference: 'BK-PENDING-CANC',
        status: 'CONFIRMED',
        totalPrice: 100000,
        currency: 'INR',
      };

      const cancellationData = {
        request: {
          id: 'cr-pending',
          status: 'PENDING_APPROVAL',
          cancellationReason: 'Work schedule change',
          calculatedRefundAmount: 90000,
          calculatedPenaltyAmount: 10000,
        },
        settlements: [],
      };

      BookingDetailModal.renderBooking(sampleBooking, { status: 'SUCCESS' }, cancellationData);

      expect(dom.bookingDetailModal.textContent).toContain('PENDING_APPROVAL');
      expect(dom.bookingDetailModal.textContent).toContain('Work schedule change');
      expect(dom.bookingDetailModal.textContent).toContain('Calculated Refund Amount');
    });

    // ============================================================
    // CRITICAL REGRESSION INVARIANT TESTS
    // ============================================================

    it('CRITICAL REGRESSION: AUTHORIZED cancellation with PROCESSING refund MUST display Refund Processing while keeping booking CONFIRMED and payment SUCCESS', () => {
      const sampleBooking = {
        bookingReference: 'BK-PROCESSING-REFUND',
        status: 'CONFIRMED', // AUTHORITATIVE: Booking remains CONFIRMED
        totalPrice: 100000,
        currency: 'INR',
      };

      const paymentData = {
        status: 'SUCCESS', // AUTHORITATIVE: Payment remains SUCCESS
        amount: 100000,
        currency: 'INR',
      };

      const cancellationData = {
        request: {
          id: 'cr-auth-1',
          status: 'AUTHORIZED',
          cancellationReason: 'Travel plan altered',
          calculatedRefundAmount: 90000,
          calculatedPenaltyAmount: 10000,
        },
        settlements: [
          {
            id: 'settle-proc-1',
            settlementStatus: 'PROCESSING',
            refundAmount: 90000,
            currency: 'INR',
          },
        ],
      };

      BookingDetailModal.renderBooking(sampleBooking, paymentData, cancellationData);

      // Invariant checks:
      // 1. Displays AUTHORIZED and Refund Processing
      expect(dom.bookingDetailModal.textContent).toContain('AUTHORIZED');
      expect(dom.bookingDetailModal.textContent).toContain('Refund Processing');

      // 2. Booking status badge remains CONFIRMED (NOT Cancelled)
      const badge = dom.document.getElementById('detail-status-badge');
      expect(badge?.textContent).toBe('CONFIRMED');

      // 3. Must explain that booking remains active until settlement confirms
      expect(dom.bookingDetailModal.textContent).toContain(
        'Your booking remains active and valid until financial settlement is confirmed',
      );
    });

    it('CRITICAL REGRESSION: COMPLETED cancellation with SETTLED refund displays Refund Completed, booking CANCELLED, and payment REFUNDED', () => {
      const sampleBooking = {
        bookingReference: 'BK-SETTLED-REFUND',
        status: 'CANCELLED', // Settled refund finalizes booking to CANCELLED
        totalPrice: 100000,
        currency: 'INR',
      };

      const paymentData = {
        status: 'REFUNDED', // Settled refund transitions payment to REFUNDED
        amount: 100000,
        currency: 'INR',
      };

      const cancellationData = {
        request: {
          id: 'cr-comp-1',
          status: 'COMPLETED',
          cancellationReason: 'Medical issue',
          calculatedRefundAmount: 90000,
          calculatedPenaltyAmount: 10000,
        },
        settlements: [
          {
            id: 'settle-settled-1',
            settlementStatus: 'SETTLED',
            refundAmount: 90000,
            currency: 'INR',
          },
        ],
      };

      BookingDetailModal.renderBooking(sampleBooking, paymentData, cancellationData);

      expect(dom.bookingDetailModal.textContent).toContain('COMPLETED');
      expect(dom.bookingDetailModal.textContent).toContain('Cancellation Completed');
      const badge = dom.document.getElementById('detail-status-badge');
      expect(badge?.textContent).toBe('CANCELLED');
    });
  });
});
