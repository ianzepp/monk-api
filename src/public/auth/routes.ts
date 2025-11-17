/**
 * Public Auth Route Barrel Export
 *
 * Public authentication routes for token acquisition (no JWT required):
 * - Login: Get initial access token
 * - Register: Create new account
 * - Refresh: Exchange old token for new token
 * - Tenants: List available tenants (personal mode only)
 * - Templates: List available templates (personal mode only)
 */

export { default as LoginPost } from './login/POST.js';
export { default as RegisterPost } from './register/POST.js';
export { default as RefreshPost } from './refresh/POST.js';
export { default as TenantsGet } from './tenants/GET.js';
export { default as TemplatesGet } from './templates/GET.js';
