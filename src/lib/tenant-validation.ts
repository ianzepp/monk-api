/**
 * Tenant Name Validation Helper
 * 
 * Centralized validation logic for tenant names across all endpoints
 */

export interface TenantValidationResult {
  isValid: boolean;
  error?: string;
}

export class TenantValidation {
  
  /**
   * Validate tenant name with all business rules
   * 
   * Rules:
   * 1. Must be at least 2 characters long
   * 2. Must contain only lowercase letters, numbers, underscores, and hyphens
   * 3. Cannot start with reserved prefixes: test_ or monk_
   * 4. Cannot be exact reserved names: test or monk
   */
  static validateTenantName(name: string): TenantValidationResult {
    // Check if name is provided and is string
    if (!name || typeof name !== 'string') {
      return {
        isValid: false,
        error: 'Tenant name is required and must be a string'
      };
    }
    
    // Check minimum length (at least 2 characters)
    if (name.length < 2) {
      return {
        isValid: false,
        error: 'Tenant name must be at least 2 characters long'
      };
    }
    
    // Check format (lowercase letters, numbers, underscores, hyphens only)
    if (!/^[a-z0-9_-]+$/.test(name)) {
      return {
        isValid: false,
        error: 'Tenant name must contain only lowercase letters, numbers, underscores, and hyphens'
      };
    }
    
    // Check for exact reserved names
    if (name === 'monk' || name === 'test') {
      return {
        isValid: false,
        error: 'Tenant name cannot be exact reserved names: monk or test'
      };
    }
    
    // Check for reserved prefixes
    if (name.startsWith('test_') || name.startsWith('monk_')) {
      return {
        isValid: false,
        error: 'Tenant name cannot start with reserved prefixes: test_ or monk_'
      };
    }
    
    return {
      isValid: true
    };
  }
  
  /**
   * Validate tenant name and return JSON error response if invalid
   * Helper for consistent error responses across endpoints
   */
  static validateAndRespond(context: any, name: string): boolean {
    const validation = this.validateTenantName(name);
    
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