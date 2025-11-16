/**
 * Protected Auth API Route Barrel Export
 *
 * Protected authentication routes for user account management (JWT required):
 * - User info: Get current authenticated user details
 * - Privilege elevation: Sudo access for protected operations
 * - User impersonation: Fake user tokens for debugging (root only)
 */

export { default as WhoamiGet } from './whoami/GET.js';
export { default as SudoPost } from './sudo/POST.js';
export { default as FakePost } from './fake/POST.js';
