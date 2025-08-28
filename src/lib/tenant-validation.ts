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
   * Validate tenant name with simplified rules for hashed database architecture
   * 
   * Simplified Rules (with Unicode support):
   * 1. Must be at least 2 characters long
   * 2. Cannot be exact reserved names: monk or test (case-insensitive)
   * 3. Any Unicode characters allowed (database uses hash)
   */
  static validateTenantName(name: string): TenantValidationResult {
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
    
    // Check for exact reserved names (case-insensitive for safety)
    const lowercaseName = normalizedName.toLowerCase();
    if (lowercaseName === 'monk' || lowercaseName === 'test') {
      return {
        isValid: false,
        error: 'Reserved name: monk or test'
      };
    }
    
    // Everything else is allowed (Unicode, spaces, emoji, etc.)
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