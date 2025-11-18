/**
 * Auth Route Barrel Export
 *
 * Public authentication routes (no JWT required):
 * - Login: Get initial access token
 * - Register: Create new account
 * - Refresh: Exchange old token for new token
 * - Tenants: List available tenants (personal mode only)
 * - Templates: List available templates (personal mode only)
 *
 * Protected authentication routes (JWT required):
 * - User info: Get current authenticated user details
 * - Privilege elevation: Sudo access for protected operations
 * - User impersonation: Fake user tokens for debugging (root only)
 */

// Public auth routes (no JWT required)
export { default as LoginPost } from './login/POST.js';
export { default as RegisterPost } from './register/POST.js';
export { default as RefreshPost } from './refresh/POST.js';
export { default as TenantsGet } from './tenants/GET.js';
export { default as TemplatesGet } from './templates/GET.js';

// Protected auth routes (JWT required)
export { default as WhoamiGet } from './whoami/GET.js';
export { default as SudoPost } from './sudo/POST.js';
export { default as FakePost } from './fake/POST.js';
