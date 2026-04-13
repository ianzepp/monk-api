/**
 * Auth Route Barrel Export
 *
 * Public auth routes:
 * - Register: Auth0-authenticated tenant provisioning
 * - Login: explicit non-production local-auth bootstrap only
 * - Refresh: explicit non-production local-auth bootstrap only
 * - Tenants: list available tenants (personal mode only)
 */

export { default as LoginPost } from './login/POST.js';
export { default as RegisterPost } from './register/POST.js';
export { default as RefreshPost } from './refresh/POST.js';
export { default as TenantsGet } from './tenants/GET.js';
