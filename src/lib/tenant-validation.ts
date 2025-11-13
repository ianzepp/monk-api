/**
 * Tenant Name Validation Helper
 * 
 * Centralized validation logic for tenant names across all endpoints.
 * Supports two naming modes:
 * - Enterprise: Permissive (any Unicode), database name is hashed
 * - Personal: Stricter validation for human-readable database names
 */

import { TenantNamingMode } from './database-naming.js';

export interface TenantValidationResult {
  isValid: boolean;
  error?: string;
}

export class TenantValidation {
  
  /**
   * Validate tenant name with mode-aware rules
   * 
   * Enterprise Mode Rules (permissive):
   * 1. Must be at least 2 characters long
   * 2. Cannot be exact reserved names: monk, test, postgres, template0, template1
   * 3. Any Unicode characters allowed (database uses hash)
   * 
   * Personal Mode Rules (stricter for human-readable DB names):
   * 1. Must be at least 2 characters long
   * 2. Cannot be reserved database names
   * 3. Maximum 50 characters (leaves room for tenant_ prefix)
   * 4. Only letters, numbers, hyphens, underscores, and spaces allowed
   * 
   * @param name - Tenant name to validate
   * @param mode - Naming mode (default: ENTERPRISE)
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
    
    // Personal mode has additional restrictions
    if (mode === TenantNamingMode.PERSONAL) {
      // Check length limit (PostgreSQL max is 63, tenant_ prefix is 7, leave room for sanitization)
      if (normalizedName.length > 50) {
        return {
          isValid: false,
          error: 'Tenant name too long (max 50 characters for personal mode)'
        };
      }
      
      // Check for allowed characters (letters, numbers, hyphens, underscores, spaces)
      if (!/^[a-zA-Z0-9_\-\s]+$/.test(normalizedName)) {
        return {
          isValid: false,
          error: 'Only letters, numbers, hyphens, underscores, and spaces allowed in personal mode'
        };
      }
    }
    
    // Everything else is allowed
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
   * @param mode - Naming mode (default: ENTERPRISE)
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