import { NavbarComponent } from './components/navbar.js';
import { api } from './api/client.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI Components
  NavbarComponent.init();

  // Log API Client readiness
  // eslint-disable-next-line no-console
  console.info('🚀 Young Tours & Travels Frontend initialized.');

  // Optional background health check probe
  api
    .checkHealth()
    .then((health) => {
      // eslint-disable-next-line no-console
      console.info('✅ Backend API Health check:', health.status);
    })
    .catch((_err) => {
      // Offline mode or API server not yet started - silent fallback
    });
});
