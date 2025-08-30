/**
 * Auth API Route Barrel Export
 *
 * Clean route organization using your preferred naming convention:
 * @see docs/routes/AUTH_API.md
 */

// Auth operations
export { default as LoginPost } from '@src/routes/auth/login/POST.js';
export { default as RegisterPost } from '@src/routes/auth/register/POST.js';
export { default as RefreshPost } from '@src/routes/auth/refresh/POST.js';
export { default as WhoamiGet } from '@src/routes/auth/whoami/GET.js';
