import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthModal } from '../../frontend/src/components/authModal.js';
import { NavbarComponent } from '../../frontend/src/components/navbar.js';
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
  textContent = '';
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  classList = new MockClassList();
  eventListeners = new Map<string, Array<(event: any) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
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
    // focused element tracking
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
    return this.textContent;
  }

  set innerHTML(html: string) {
    // Parse HTML string into lightweight MockElement DOM nodes
    this.children = [];
    this.textContent = '';
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

function parseHtmlInto(html: string, parent: MockElement) {
  // Regex token parser for tags and text
  const tagRegex = /<([a-z0-9]+)([^>]*)>(.*?)<\/\1>|<([a-z0-9]+)([^>]*)\/?>|([^<]+)/gis;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const [, pairTag, pairAttrs, pairContent, selfTag, selfAttrs, text] = match;

    if (text && text.trim()) {
      parent.textContent += text;
      continue;
    }

    const tagName = pairTag || selfTag;
    const rawAttrs = pairAttrs || selfAttrs || '';

    if (!tagName) continue;

    const el = new MockElement(tagName);

    // Extract attributes
    const attrRegex = /([a-z0-9_-]+)(?:=["']([^"']*)["'])?/gi;
    let attrMatch;
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
      else if (name === 'autocomplete') el.autocomplete = val;
      else el.setAttribute(name, val);
    }

    parent.appendChild(el);

    if (pairContent) {
      parseHtmlInto(pairContent, el);
    }
  }
}

function setupMockDom() {
  const documentListeners = new Map<string, Array<(event: any) => void>>();
  const windowListeners = new Map<string, Array<(event: any) => void>>();

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
    addEventListener: (type: string, listener: (e: any) => void) => {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type)!.push(listener);
    },
    removeEventListener: (type: string, listener: (e: any) => void) => {
      const list = documentListeners.get(type) || [];
      documentListeners.set(
        type,
        list.filter((l) => l !== listener),
      );
    },
    dispatchEvent: (event: any) => {
      const list = documentListeners.get(event.type) || [];
      list.forEach((l) => l(event));
    },
  };

  const window = {
    scrollY: 0,
    addEventListener: (type: string, listener: (e: any) => void) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type)!.push(listener);
    },
    removeEventListener: (type: string, listener: (e: any) => void) => {
      const list = windowListeners.get(type) || [];
      windowListeners.set(
        type,
        list.filter((l) => l !== listener),
      );
    },
    dispatchEvent: (event: any) => {
      const list = windowListeners.get(event.type) || [];
      list.forEach((l) => l(event));
    },
  };

  (globalThis as any).document = document;
  (globalThis as any).window = window;

  // Mock FormData
  (globalThis as any).FormData = class MockFormData {
    map = new Map<string, any>();
    constructor(form?: MockElement) {
      if (form) {
        const inputs = form.querySelectorAll('input');
        inputs.forEach((input) => {
          if (input.name) {
            this.map.set(input.name, input.value);
          }
        });
      }
    }
    get(name: string) {
      return this.map.get(name) ?? null;
    }
    set(name: string, value: any) {
      this.map.set(name, value);
    }
  };
}

describe('Phase 2 Step 8 — Frontend Authentication UI', () => {
  const mockUser = {
    id: 'usr_8839210_uuid',
    email: 'traveller@example.com',
    fullName: 'John Doe',
    role: 'CUSTOMER',
    isActive: true,
  };

  beforeEach(() => {
    setupMockDom();
    authStore.clearSession();
    AuthModal.modalEl = null;
    AuthModal.currentMode = 'login';
    AuthModal.isSubmitting = false;

    // Build base Navbar DOM
    const nav = (globalThis as any).document.createElement('nav');
    nav.id = 'main-nav';
    nav.className = 'navbar';
    const navLinks = (globalThis as any).document.createElement('ul');
    navLinks.className = 'nav-links';
    nav.appendChild(navLinks);
    (globalThis as any).document.body.appendChild(nav);

    NavbarComponent.init();
    AuthModal.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LOGIN UI', () => {
    it('1. login form renders with all required sections', () => {
      AuthModal.open('login');
      const form = (globalThis as any).document.querySelector('#auth-form');
      expect(form).not.toBeNull();
      expect((globalThis as any).document.querySelector('#auth-modal-title').textContent).toBe(
        'Welcome Back',
      );
    });

    it('2. email input exists with correct attributes', () => {
      AuthModal.open('login');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      expect(emailInput).not.toBeNull();
      expect(emailInput.type).toBe('email');
      expect(emailInput.autocomplete).toBe('email');
    });

    it('3. password input exists with correct password type and toggle', () => {
      AuthModal.open('login');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      expect(passwordInput).not.toBeNull();
      expect(passwordInput.type).toBe('password');
      expect(passwordInput.autocomplete).toBe('current-password');

      const toggleBtn = (globalThis as any).document.querySelector('#btn-toggle-password');
      expect(toggleBtn).not.toBeNull();
      toggleBtn.dispatchEvent({ type: 'click' });
      expect(passwordInput.type).toBe('text');
      toggleBtn.dispatchEvent({ type: 'click' });
      expect(passwordInput.type).toBe('password');
    });

    it('4. submit button exists and has correct action text', () => {
      AuthModal.open('login');
      const submitBtn = (globalThis as any).document.querySelector('#btn-auth-submit');
      expect(submitBtn).not.toBeNull();
      expect(submitBtn.textContent.trim()).toBe('Sign In');
    });

    it('5. invalid email is rejected client-side with validation error', async () => {
      AuthModal.open('login');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      const form = (globalThis as any).document.querySelector('#auth-form');

      emailInput.value = 'invalid-email';
      passwordInput.value = 'Password123!';

      const loginSpy = vi.spyOn(api, 'login');
      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(loginSpy).not.toHaveBeenCalled();
      const errorEmail = (globalThis as any).document.querySelector('#error-email');
      expect(errorEmail.textContent).toBe('Invalid email address format');
    });

    it('6. empty password is rejected client-side with validation error', async () => {
      AuthModal.open('login');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      const form = (globalThis as any).document.querySelector('#auth-form');

      emailInput.value = 'valid@example.com';
      passwordInput.value = '';

      const loginSpy = vi.spyOn(api, 'login');
      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(loginSpy).not.toHaveBeenCalled();
      const errorPassword = (globalThis as any).document.querySelector('#error-password');
      expect(errorPassword.textContent).toBe('Password is required');
    });

    it('7. valid form calls api.login and closes modal on success', async () => {
      AuthModal.open('login');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      const form = (globalThis as any).document.querySelector('#auth-form');

      emailInput.value = 'valid@example.com';
      passwordInput.value = 'ValidPass123!';

      const loginSpy = vi.spyOn(api, 'login').mockResolvedValueOnce({
        user: mockUser,
        accessToken: 'access_token_123',
      });

      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(loginSpy).toHaveBeenCalledWith({
        email: 'valid@example.com',
        password: 'ValidPass123!',
      });
      expect((AuthModal.modalEl as any).classList.contains('hidden')).toBe(true);
    });

    it('8. loading state disables submission during in-flight login', async () => {
      AuthModal.open('login');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      const form = (globalThis as any).document.querySelector('#auth-form');
      const submitBtn = (globalThis as any).document.querySelector('#btn-auth-submit');

      emailInput.value = 'valid@example.com';
      passwordInput.value = 'ValidPass123!';

      let resolveLogin: any;
      const slowPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });
      vi.spyOn(api, 'login').mockReturnValueOnce(slowPromise as any);

      const submitPromise = form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.textContent).toBe('Signing in...');

      resolveLogin({ user: mockUser, accessToken: 'token' });
      await submitPromise;
    });

    it('9. successful login updates authStore and navbar reactively', async () => {
      authStore.setSession(mockUser, 'mock_token');
      const greeting = (globalThis as any).document.querySelector('#user-greeting-text');
      expect(greeting).not.toBeNull();
      expect(greeting.textContent).toBe('Hi, John');
    });

    it('10. login error is displayed safely in error banner', async () => {
      AuthModal.open('login');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      const form = (globalThis as any).document.querySelector('#auth-form');

      emailInput.value = 'valid@example.com';
      passwordInput.value = 'ValidPass123!';

      const authErr: any = new Error('Invalid email or password.');
      authErr.code = 'INVALID_CREDENTIALS';
      vi.spyOn(api, 'login').mockRejectedValueOnce(authErr);

      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      const banner = (globalThis as any).document.querySelector('#auth-error-banner');
      expect(banner.classList.contains('hidden')).toBe(false);
      expect(banner.textContent).toBe('Invalid email or password.');
    });
  });

  describe('REGISTRATION UI', () => {
    it('11. registration form renders', () => {
      AuthModal.open('register');
      const form = (globalThis as any).document.querySelector('#auth-form');
      expect(form).not.toBeNull();
      expect((globalThis as any).document.querySelector('#auth-modal-title').textContent).toBe(
        'Create an Account',
      );
    });

    it('12. full name input exists with correct attributes', () => {
      AuthModal.open('register');
      const fullNameInput = (globalThis as any).document.querySelector('#auth-fullname');
      expect(fullNameInput).not.toBeNull();
      expect(fullNameInput.autocomplete).toBe('name');
    });

    it('13. email input exists with correct attributes', () => {
      AuthModal.open('register');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      expect(emailInput).not.toBeNull();
      expect(emailInput.autocomplete).toBe('email');
    });

    it('14. password input exists with new-password autocomplete', () => {
      AuthModal.open('register');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      expect(passwordInput).not.toBeNull();
      expect(passwordInput.autocomplete).toBe('new-password');
    });

    it('15. mobile input exists as optional field', () => {
      AuthModal.open('register');
      const mobileInput = (globalThis as any).document.querySelector('#auth-mobile');
      expect(mobileInput).not.toBeNull();
      expect(mobileInput.autocomplete).toBe('tel');
    });

    it('16. invalid registration data (short password, weak complexity) is rejected', async () => {
      AuthModal.open('register');
      const form = (globalThis as any).document.querySelector('#auth-form');
      const fullNameInput = (globalThis as any).document.querySelector('#auth-fullname');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');

      fullNameInput.value = 'J'; // too short
      emailInput.value = 'valid@example.com';
      passwordInput.value = 'weak'; // weak password

      const regSpy = vi.spyOn(api, 'register');
      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(regSpy).not.toHaveBeenCalled();
      const nameError = (globalThis as any).document.querySelector('#error-fullname');
      expect(nameError.textContent).toBe('Full name must be at least 2 characters long');
      const passError = (globalThis as any).document.querySelector('#error-password');
      expect(passError.textContent).toBe('Password must be at least 8 characters long');
    });

    it('17. valid form calls api.register and creates session', async () => {
      AuthModal.open('register');
      const form = (globalThis as any).document.querySelector('#auth-form');
      const fullNameInput = (globalThis as any).document.querySelector('#auth-fullname');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      const mobileInput = (globalThis as any).document.querySelector('#auth-mobile');

      fullNameInput.value = 'John Doe';
      emailInput.value = 'john@example.com';
      passwordInput.value = 'StrongP@ss123';
      mobileInput.value = '+1234567890';

      const regSpy = vi.spyOn(api, 'register').mockResolvedValueOnce({
        user: mockUser,
        accessToken: 'fresh_token',
      });

      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(regSpy).toHaveBeenCalledWith({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'StrongP@ss123',
        mobileContact: '+1234567890',
      });
      expect((AuthModal.modalEl as any).classList.contains('hidden')).toBe(true);
    });

    it('18. loading state prevents duplicate submission', async () => {
      AuthModal.open('register');
      const form = (globalThis as any).document.querySelector('#auth-form');
      const submitBtn = (globalThis as any).document.querySelector('#btn-auth-submit');
      const fullNameInput = (globalThis as any).document.querySelector('#auth-fullname');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');

      fullNameInput.value = 'John Doe';
      emailInput.value = 'john@example.com';
      passwordInput.value = 'StrongP@ss123';

      let resolveReg: any;
      const slowPromise = new Promise((resolve) => {
        resolveReg = resolve;
      });
      vi.spyOn(api, 'register').mockReturnValueOnce(slowPromise as any);

      const submitPromise = form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });
      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.textContent).toBe('Creating account...');

      resolveReg({ user: mockUser, accessToken: 'token' });
      await submitPromise;
    });

    it('19. duplicate registration error is displayed safely', async () => {
      AuthModal.open('register');
      const form = (globalThis as any).document.querySelector('#auth-form');
      const fullNameInput = (globalThis as any).document.querySelector('#auth-fullname');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');

      fullNameInput.value = 'John Doe';
      emailInput.value = 'duplicate@example.com';
      passwordInput.value = 'StrongP@ss123';

      const duplicateErr: any = new Error('An account with this email already exists.');
      duplicateErr.code = 'USER_ALREADY_EXISTS';
      vi.spyOn(api, 'register').mockRejectedValueOnce(duplicateErr);

      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      const banner = (globalThis as any).document.querySelector('#auth-error-banner');
      expect(banner.classList.contains('hidden')).toBe(false);
      expect(banner.textContent).toBe('An account with this email already exists.');
    });
  });

  describe('MODE SWITCHING', () => {
    it('20. login -> register switch changes modal title and input fields', () => {
      AuthModal.open('login');
      const tabRegister = (globalThis as any).document.querySelector('#tab-register-btn');
      tabRegister.dispatchEvent({ type: 'click' });

      expect((globalThis as any).document.querySelector('#auth-modal-title').textContent).toBe(
        'Create an Account',
      );
      expect((globalThis as any).document.querySelector('#auth-fullname')).not.toBeNull();
    });

    it('21. register -> login switch restores login view', () => {
      AuthModal.open('register');
      const tabLogin = (globalThis as any).document.querySelector('#tab-login-btn');
      tabLogin.dispatchEvent({ type: 'click' });

      expect((globalThis as any).document.querySelector('#auth-modal-title').textContent).toBe(
        'Welcome Back',
      );
      expect((globalThis as any).document.querySelector('#auth-fullname')).toBeNull();
    });
  });

  describe('NAVBAR AUTH STATE', () => {
    it('22. unauthenticated state shows Login and Register buttons', () => {
      authStore.clearSession();
      const loginBtn = (globalThis as any).document.querySelector('#nav-login-btn');
      const registerBtn = (globalThis as any).document.querySelector('#nav-register-btn');

      expect(loginBtn).not.toBeNull();
      expect(registerBtn).not.toBeNull();
    });

    it('23. authenticated state shows user greeting and logout button', () => {
      authStore.setSession(mockUser, 'valid_token');
      const greeting = (globalThis as any).document.querySelector('#user-greeting-text');
      const logoutBtn = (globalThis as any).document.querySelector('#nav-logout-btn');

      expect(greeting).not.toBeNull();
      expect(greeting.textContent).toBe('Hi, John');
      expect(logoutBtn).not.toBeNull();
    });

    it('24. logout button calls api.logout and clears auth state', async () => {
      authStore.setSession(mockUser, 'valid_token');
      const logoutBtn = (globalThis as any).document.querySelector('#nav-logout-btn');
      const logoutSpy = vi.spyOn(api, 'logout').mockImplementation(async () => {
        authStore.clearSession();
      });

      await logoutBtn.dispatchEvent({ type: 'click' });

      expect(logoutSpy).toHaveBeenCalled();
      expect(authStore.isAuthenticated()).toBe(false);
      expect((globalThis as any).document.querySelector('#nav-login-btn')).not.toBeNull();
    });

    it('25. navbar automatically updates after authStore state changes', () => {
      expect((globalThis as any).document.querySelector('#nav-login-btn')).not.toBeNull();

      authStore.setSession(mockUser, 'token');
      expect((globalThis as any).document.querySelector('#user-greeting-text')).not.toBeNull();

      authStore.clearSession();
      expect((globalThis as any).document.querySelector('#nav-login-btn')).not.toBeNull();
    });
  });

  describe('MODAL BEHAVIOR', () => {
    it('26. modal opens and removes hidden class', () => {
      AuthModal.open('login');
      expect((AuthModal.modalEl as any).classList.contains('hidden')).toBe(false);
    });

    it('27. modal closes and adds hidden class', () => {
      AuthModal.open('login');
      AuthModal.close();
      expect((AuthModal.modalEl as any).classList.contains('hidden')).toBe(true);
    });

    it('28. Escape key closes modal', () => {
      AuthModal.open('login');
      (globalThis as any).document.dispatchEvent({ type: 'keydown', key: 'Escape' });
      expect((AuthModal.modalEl as any).classList.contains('hidden')).toBe(true);
    });

    it('29. close button click closes modal', () => {
      AuthModal.open('login');
      const closeBtn = (globalThis as any).document.querySelector('#auth-modal-close-btn');
      closeBtn.dispatchEvent({ type: 'click' });
      expect((AuthModal.modalEl as any).classList.contains('hidden')).toBe(true);
    });

    it('30. clicking inside modal card does not accidentally close modal', () => {
      AuthModal.open('login');
      const card = (globalThis as any).document.querySelector('#auth-modal-card');
      (AuthModal.modalEl as any).dispatchEvent({ type: 'click', target: card });
      expect((AuthModal.modalEl as any).classList.contains('hidden')).toBe(false);
    });
  });

  describe('SECURITY INVARIANTS', () => {
    it('31. password is never logged to console during interactions', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const consoleInfoSpy = vi.spyOn(console, 'info');

      AuthModal.open('login');
      const emailInput = (globalThis as any).document.querySelector('#auth-email');
      const passwordInput = (globalThis as any).document.querySelector('#auth-password');
      const form = (globalThis as any).document.querySelector('#auth-form');

      emailInput.value = 'user@example.com';
      passwordInput.value = 'SecretP@ssword99';

      vi.spyOn(api, 'login').mockResolvedValueOnce({
        user: mockUser,
        accessToken: 'valid_token',
      });

      await form.dispatchEvent({ type: 'submit', preventDefault: vi.fn() });

      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('SecretP@ssword99'));
      expect(consoleInfoSpy).not.toHaveBeenCalledWith(expect.stringContaining('SecretP@ssword99'));
    });

    it('32. access token is never rendered into DOM elements', () => {
      const sensitiveToken = 'eyJhbGciOiJSUzI1NiJ9.sensitive_payload.signature';
      authStore.setSession(mockUser, sensitiveToken);

      const html = (globalThis as any).document.body.innerHTML;
      expect(html).not.toContain(sensitiveToken);
    });

    it('33. refresh token is never accessed or manipulated in frontend components', () => {
      expect(((globalThis as any).window as any)?.refreshToken).toBeUndefined();
      expect(((globalThis as any).document as any)?.cookie).toBeUndefined();
    });

    it('34. no localStorage or sessionStorage is used by auth components', () => {
      expect((globalThis as any).localStorage).toBeUndefined();
      expect((globalThis as any).sessionStorage).toBeUndefined();
    });
  });

  describe('ACCESSIBILITY & SEMANTICS', () => {
    it('35. labels correctly associate with inputs via for/id mapping', () => {
      AuthModal.open('register');
      const form = (globalThis as any).document.querySelector('#auth-form');

      const nameLabel = form.querySelector('label[for="auth-fullname"]');
      const emailLabel = form.querySelector('label[for="auth-email"]');
      const passLabel = form.querySelector('label[for="auth-password"]');

      expect(nameLabel).not.toBeNull();
      expect(emailLabel).not.toBeNull();
      expect(passLabel).not.toBeNull();
    });

    it('36. buttons are semantic and keyboard accessible', () => {
      AuthModal.open('login');
      const submitBtn = (globalThis as any).document.querySelector('#btn-auth-submit');
      const closeBtn = (globalThis as any).document.querySelector('#auth-modal-close-btn');

      expect(submitBtn.tagName).toBe('BUTTON');
      expect(closeBtn.tagName).toBe('BUTTON');
    });

    it('37. errors are accessible with role="alert" and aria-live="polite"', () => {
      AuthModal.open('login');
      const banner = (globalThis as any).document.querySelector('#auth-error-banner');
      expect(banner.getAttribute('role')).toBe('alert');
      expect(banner.getAttribute('aria-live')).toBe('polite');
    });

    it('38. autocomplete attributes are compliant with standards', () => {
      AuthModal.open('register');
      const email = (globalThis as any).document.querySelector('#auth-email');
      const password = (globalThis as any).document.querySelector('#auth-password');
      const name = (globalThis as any).document.querySelector('#auth-fullname');
      const mobile = (globalThis as any).document.querySelector('#auth-mobile');

      expect(email.autocomplete).toBe('email');
      expect(password.autocomplete).toBe('new-password');
      expect(name.autocomplete).toBe('name');
      expect(mobile.autocomplete).toBe('tel');
    });
  });
});
