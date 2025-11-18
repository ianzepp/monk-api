/**
 * User API Routes - Self-Service User Management
 *
 * Phase 1: Self-Service Endpoints Only
 * Allows users to manage their own profiles without requiring sudo access.
 *
 * These endpoints bypass the users table sudo requirement using the
 * withSelfServiceSudo() helper which sets the 'as_sudo' flag.
 */

export { default as ProfileGet } from './profile/GET.js';
export { default as ProfilePut } from './profile/PUT.js';
export { default as DeactivatePost } from './deactivate/POST.js';
