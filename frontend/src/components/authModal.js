import { api } from '../api/client.js';
import { authStore } from '../state/auth.js';

/**
 * Authentication Modal Component
 * Handles login and registration forms, validation, loading states, and error presentation.
 */
export class AuthModal {
  static modalEl = null;
  static currentMode = 'login'; // 'login' | 'register'
  static isSubmitting = false;

  /**
   * Initialize modal DOM element and global event listeners.
   */
  static init() {
    if (this.modalEl && document.body.contains(this.modalEl)) return;

    let el = document.getElementById('auth-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auth-modal';
      el.className = 'auth-modal-backdrop hidden';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'auth-modal-title');
      document.body.appendChild(el);
    }
    this.modalEl = el;

    this.render();
    this.bindGlobalEvents();
  }

  /**
   * Render modal structure and inner form content based on currentMode.
   */
  static render() {
    if (!this.modalEl) return;

    const isLogin = this.currentMode === 'login';

    this.modalEl.innerHTML = `
      <div class="auth-modal-card" id="auth-modal-card">
        <button class="auth-modal-close" id="auth-modal-close-btn" aria-label="Close authentication modal">&times;</button>
        
        <div class="auth-modal-header">
          <h2 id="auth-modal-title">${isLogin ? 'Welcome Back' : 'Create an Account'}</h2>
          <p class="auth-modal-subtitle">${
            isLogin
              ? 'Enter your credentials to access your account'
              : 'Join Young Tours & Travels for exclusive adventures'
          }</p>
        </div>

        <div class="auth-mode-switch">
          <button 
            type="button" 
            class="auth-tab-btn ${isLogin ? 'active' : ''}" 
            id="tab-login-btn"
            aria-selected="${isLogin}"
          >Login</button>
          <button 
            type="button" 
            class="auth-tab-btn ${!isLogin ? 'active' : ''}" 
            id="tab-register-btn"
            aria-selected="${!isLogin}"
          >Register</button>
        </div>

        <div id="auth-error-banner" class="auth-error-banner hidden" role="alert" aria-live="polite"></div>

        <form id="auth-form" class="auth-form" novalidate>
          ${
            !isLogin
              ? `
            <div class="form-group" id="group-fullname">
              <label for="auth-fullname">Full Name</label>
              <input 
                type="text" 
                id="auth-fullname" 
                name="fullName" 
                autocomplete="name" 
                placeholder="John Doe" 
                required 
                maxlength="255"
              />
              <span class="field-error" id="error-fullname"></span>
            </div>
          `
              : ''
          }

          <div class="form-group" id="group-email">
            <label for="auth-email">Email Address</label>
            <input 
              type="email" 
              id="auth-email" 
              name="email" 
              autocomplete="email" 
              placeholder="name@example.com" 
              required 
              maxlength="255"
            />
            <span class="field-error" id="error-email"></span>
          </div>

          <div class="form-group" id="group-password">
            <label for="auth-password">Password</label>
            <div class="password-input-wrapper">
              <input 
                type="password" 
                id="auth-password" 
                name="password" 
                autocomplete="${isLogin ? 'current-password' : 'new-password'}" 
                placeholder="${isLogin ? 'Enter your password' : 'At least 8 chars, 1 uppercase, 1 number, 1 special'}" 
                required 
                maxlength="128"
              />
              <button 
                type="button" 
                class="btn-toggle-password" 
                id="btn-toggle-password" 
                aria-label="Show password" 
                aria-pressed="false"
              >👁️</button>
            </div>
            <span class="field-error" id="error-password"></span>
          </div>

          ${
            !isLogin
              ? `
            <div class="form-group" id="group-mobile">
              <label for="auth-mobile">Mobile Contact <span class="optional-tag">(Optional)</span></label>
              <input 
                type="tel" 
                id="auth-mobile" 
                name="mobileContact" 
                autocomplete="tel" 
                placeholder="+1234567890" 
                maxlength="30"
              />
              <span class="field-error" id="error-mobile"></span>
            </div>
          `
              : ''
          }

          <button type="submit" class="btn-primary btn-auth-submit" id="btn-auth-submit">
            ${isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div class="auth-modal-footer">
          ${
            isLogin
              ? `<p>Don't have an account? <button type="button" class="btn-inline-link" id="link-switch-to-register">Register here</button></p>`
              : `<p>Already have an account? <button type="button" class="btn-inline-link" id="link-switch-to-login">Sign in here</button></p>`
          }
        </div>
      </div>
    `;

    this.bindFormEvents();
  }

  /**
   * Bind events to rendered form elements.
   */
  static bindFormEvents() {
    const closeBtn = this.modalEl.querySelector('#auth-modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    const tabLogin = this.modalEl.querySelector('#tab-login-btn');
    const tabRegister = this.modalEl.querySelector('#tab-register-btn');
    const linkSwitchRegister = this.modalEl.querySelector('#link-switch-to-register');
    const linkSwitchLogin = this.modalEl.querySelector('#link-switch-to-login');

    if (tabLogin) tabLogin.addEventListener('click', () => this.setMode('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => this.setMode('register'));
    if (linkSwitchRegister)
      linkSwitchRegister.addEventListener('click', () => this.setMode('register'));
    if (linkSwitchLogin) linkSwitchLogin.addEventListener('click', () => this.setMode('login'));

    const togglePasswordBtn = this.modalEl.querySelector('#btn-toggle-password');
    const passwordInput = this.modalEl.querySelector('#auth-password');
    if (togglePasswordBtn && passwordInput) {
      togglePasswordBtn.addEventListener('click', () => {
        const isCurrentlyPassword = passwordInput.type === 'password';
        passwordInput.type = isCurrentlyPassword ? 'text' : 'password';
        togglePasswordBtn.setAttribute('aria-pressed', String(isCurrentlyPassword));
        togglePasswordBtn.setAttribute(
          'aria-label',
          isCurrentlyPassword ? 'Hide password' : 'Show password',
        );
        togglePasswordBtn.textContent = isCurrentlyPassword ? '🔒' : '👁️';
      });
    }

    const form = this.modalEl.querySelector('#auth-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  /**
   * Global event listeners (Escape key & backdrop click).
   */
  static bindGlobalEvents() {
    if (!this.modalEl) return;

    this.modalEl.addEventListener('click', (e) => {
      // Close only if clicking the backdrop directly, not inside the card
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modalEl.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  /**
   * Open the modal with the specified mode ('login' or 'register').
   * @param {'login'|'register'} mode
   */
  static open(mode = 'login') {
    this.init();
    this.setMode(mode);
    this.modalEl.classList.remove('hidden');
    document.body.classList.add('modal-open');

    // Accessible focus management
    setTimeout(() => {
      const firstInput = this.modalEl.querySelector('input:not([type=hidden])');
      if (firstInput) firstInput.focus();
    }, 50);
  }

  /**
   * Close the modal and reset errors and state.
   */
  static close() {
    if (!this.modalEl) return;
    this.modalEl.classList.add('hidden');
    document.body.classList.remove('modal-open');
    this.clearErrors();
    this.isSubmitting = false;
  }

  /**
   * Switch modal mode ('login' | 'register').
   * @param {'login'|'register'} mode
   */
  static setMode(mode) {
    if (this.currentMode === mode && this.modalEl.querySelector('#auth-form')) {
      return;
    }
    this.currentMode = mode;
    this.clearErrors();
    this.render();
    const firstInput = this.modalEl.querySelector('input:not([type=hidden])');
    if (firstInput) firstInput.focus();
  }

  /**
   * Clear error banner and field errors.
   */
  static clearErrors() {
    if (!this.modalEl) return;
    const banner = this.modalEl.querySelector('#auth-error-banner');
    if (banner) {
      banner.textContent = '';
      banner.classList.add('hidden');
    }
    const fieldErrors = this.modalEl.querySelectorAll('.field-error');
    fieldErrors.forEach((el) => {
      el.textContent = '';
    });
  }

  /**
   * Display top-level error banner.
   * @param {string} message
   */
  static showErrorBanner(message) {
    if (!this.modalEl) return;
    const banner = this.modalEl.querySelector('#auth-error-banner');
    if (banner) {
      banner.textContent = message;
      banner.classList.remove('hidden');
    }
  }

  /**
   * Set field-specific validation error.
   * @param {string} fieldName
   * @param {string} message
   */
  static setFieldError(fieldName, message) {
    if (!this.modalEl) return;
    const errorEl = this.modalEl.querySelector(`#error-${fieldName.toLowerCase()}`);
    if (errorEl) {
      errorEl.textContent = message;
    }
  }

  /**
   * Validate form fields client-side for immediate UX feedback.
   * @param {FormData} formData
   * @returns {boolean} isValid
   */
  static validate(formData) {
    this.clearErrors();
    let isValid = true;
    const isLogin = this.currentMode === 'login';

    const email = (formData.get('email') || '').toString().trim();
    const password = (formData.get('password') || '').toString();

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      this.setFieldError('email', 'Email is required');
      isValid = false;
    } else if (!emailRegex.test(email) || email.length > 255) {
      this.setFieldError('email', 'Invalid email address format');
      isValid = false;
    }

    // Password validation
    if (!password) {
      this.setFieldError('password', 'Password is required');
      isValid = false;
    } else if (!isLogin) {
      if (password.length < 8) {
        this.setFieldError('password', 'Password must be at least 8 characters long');
        isValid = false;
      } else if (password.length > 128) {
        this.setFieldError('password', 'Password must not exceed 128 characters');
        isValid = false;
      } else if (!/[A-Z]/.test(password)) {
        this.setFieldError('password', 'Password must contain at least one uppercase letter');
        isValid = false;
      } else if (!/[0-9]/.test(password)) {
        this.setFieldError('password', 'Password must contain at least one number');
        isValid = false;
      } else if (!/[^A-Za-z0-9]/.test(password)) {
        this.setFieldError('password', 'Password must contain at least one special character');
        isValid = false;
      }
    }

    // Registration specific fields
    if (!isLogin) {
      const fullName = (formData.get('fullName') || '').toString().trim();
      const mobile = (formData.get('mobileContact') || '').toString().trim();

      if (!fullName) {
        this.setFieldError('fullname', 'Full name is required');
        isValid = false;
      } else if (fullName.length < 2) {
        this.setFieldError('fullname', 'Full name must be at least 2 characters long');
        isValid = false;
      } else if (fullName.length > 255) {
        this.setFieldError('fullname', 'Full name must not exceed 255 characters');
        isValid = false;
      }

      if (mobile && mobile.length > 30) {
        this.setFieldError('mobile', 'Mobile contact must not exceed 30 characters');
        isValid = false;
      }
    }

    return isValid;
  }

  /**
   * Handle form submission for login and register.
   * @param {Event} e
   */
  static async handleSubmit(e) {
    e.preventDefault();
    if (this.isSubmitting) return;

    const form = e.target;
    const formData = new FormData(form);

    if (!this.validate(formData)) {
      return;
    }

    const submitBtn = this.modalEl.querySelector('#btn-auth-submit');
    const isLogin = this.currentMode === 'login';

    try {
      this.isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = isLogin ? 'Signing in...' : 'Creating account...';
      }

      const email = (formData.get('email') || '').toString().trim().toLowerCase();
      const password = (formData.get('password') || '').toString();

      if (isLogin) {
        await api.login({ email, password });
      } else {
        const fullName = (formData.get('fullName') || '').toString().trim();
        const mobileContact = (formData.get('mobileContact') || '').toString().trim();
        const payload = { email, password, fullName };
        if (mobileContact) {
          payload.mobileContact = mobileContact;
        }
        await api.register(payload);
      }

      // Successful auth - close modal
      this.close();
    } catch (err) {
      // Map API client errors to safe user-friendly messages
      let message = 'An unexpected error occurred. Please try again.';

      if (err.code === 'INVALID_CREDENTIALS') {
        message = 'Invalid email or password.';
      } else if (err.code === 'USER_ALREADY_EXISTS') {
        message = 'An account with this email already exists.';
      } else if (err.code === 'VALIDATION_ERROR') {
        if (Array.isArray(err.details) && err.details.length > 0) {
          message = err.details.map((d) => d.message).join('. ');
        } else {
          message = err.message || 'Validation failed. Please check your entries.';
        }
      } else if (err.message && !err.message.startsWith('HTTP Error')) {
        message = err.message;
      }

      this.showErrorBanner(message);
    } finally {
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isLogin ? 'Sign In' : 'Create Account';
      }
    }
  }
}
