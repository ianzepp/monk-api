/**
 * Protected Auth API Route Barrel Export
 *
 * Protected authentication routes for user account management (JWT required):
 * - User info: Get current authenticated user details
 * - Profile management: Update user settings
 * - Session management: Logout, session control
 */

export { default as WhoamiGet } from './whoami/GET.js';
export { default as SudoPost } from './sudo/POST.js';
