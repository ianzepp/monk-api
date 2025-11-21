/**
 * Tenant Name Validation Helper
 *
 * Centralized validation logic for tenant names across all endpoints.
 * All tenant names are hashed to avoid environment conflicts.
 *
 * Validation Rules:
 * 1. Must be at least 2 characters long
 * 2. Cannot be exact reserved names: monk, test, postgres, template0, template1
 * 3. Any Unicode characters allowed (database uses SHA256 hash)
 */

import { TenantNamingMode } from './database-naming.js';

export interface TenantValidationResult {
  isValid: boolean;
  error?: string;
}

export class TenantValidation {

  /**
   * Validate tenant name
   *
   * Rules:
   * 1. Must be at least 2 characters long
   * 2. Cannot be exact reserved names
   * 3. Any Unicode characters allowed (database name will be hashed)
   *
   * @param name - Tenant name to validate
   * @param mode - Naming mode (kept for backward compatibility, ignored)
   * @returns Validation result with error message if invalid
   */
  static validateTenantName(
    name: string,
    mode: TenantNamingMode = TenantNamingMode.ENTERPRISE
  ): TenantValidationResult {
    // Check if name is provided and is string
    if (!name || typeof name !== 'string') {
      return {
        isValid: false,
        error: 'Tenant name is required and must be a string'
      };
    }

    // Normalize whitespace for validation
    const normalizedName = name.trim();

    // Check minimum length (at least 2 characters after trim)
    if (normalizedName.length < 2) {
      return {
        isValid: false,
        error: 'Tenant name must be at least 2 characters long'
      };
    }

    // Check for reserved names (case-insensitive)
    const lowercaseName = normalizedName.toLowerCase();
    const reservedNames = ['monk', 'test', 'postgres', 'template0', 'template1', 'system'];

    if (reservedNames.includes(lowercaseName)) {
      return {
        isValid: false,
        error: `Reserved name: ${lowercaseName}`
      };
    }

    // All other names are allowed (will be hashed for database name)
    return {
      isValid: true
    };
  }

  /**
   * Validate tenant name and return JSON error response if invalid
   * Helper for consistent error responses across endpoints
   *
   * @param context - Hono context for sending JSON response
   * @param name - Tenant name to validate
   * @param mode - Naming mode (kept for backward compatibility, ignored)
   * @returns true if valid, false if invalid (response already sent)
   */
  static validateAndRespond(
    context: any,
    name: string,
    mode: TenantNamingMode = TenantNamingMode.ENTERPRISE
  ): boolean {
    const validation = this.validateTenantName(name, mode);

    if (!validation.isValid) {
      context.json({
        success: false,
        error: validation.error
      }, 400);
      return false;
    }

    return true;
  }
}