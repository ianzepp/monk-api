/**
 * User API Routes - Self-Service User Management
 *
 * Provides authenticated user endpoints for profile management and identity:
 * - User info: Get current authenticated user details
 * - Privilege elevation: Sudo access for protected operations
 * - Profile management: Self-service profile updates
 * - Account deactivation: Self-service account closure
 *
 * Self-service endpoints bypass the users table sudo requirement using the
 * withSelfServiceSudo() helper which sets the 'as_sudo' flag.
 */

export { default as WhoamiGet } from './whoami/GET.js';
export { default as SudoPost } from './sudo/POST.js';
export { default as FakePost } from './fake/POST.js';
export { default as ProfileGet } from './profile/GET.js';
export { default as ProfilePut } from './profile/PUT.js';
export { default as DeactivatePost } from './deactivate/POST.js';
