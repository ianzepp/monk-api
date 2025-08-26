import type { Context, Next } from 'hono'
import { createErrorResponse, ApiErrorCode } from '@src/lib/api/responses.js'

// Access levels in hierarchical order
export enum AccessLevel {
    DENY = 0,
    READ = 1, 
    EDIT = 2,
    FULL = 3,
    ROOT = 4
}

// Convert string to access level
export function parseAccessLevel(access: string): AccessLevel {
    switch (access?.toLowerCase()) {
        case 'deny': return AccessLevel.DENY
        case 'read': return AccessLevel.READ
        case 'edit': return AccessLevel.EDIT
        case 'full': return AccessLevel.FULL
        case 'root': return AccessLevel.ROOT
        default: return AccessLevel.DENY
    }
}

// Check if user has minimum required access level
export function hasMinimumAccess(userAccess: AccessLevel, requiredAccess: AccessLevel): boolean {
    return userAccess >= requiredAccess
}

// Access control middleware factory
export function requireAccess(minLevel: AccessLevel) {
    return async (c: Context, next: Next) => {
        const user = c.get('user')
        
        if (!user) {
            return createErrorResponse(c, 'Authentication required', ApiErrorCode.NOT_FOUND, 401)
        }
        
        const userAccess = parseAccessLevel(user.access)
        
        if (!hasMinimumAccess(userAccess, minLevel)) {
            const requiredLevel = AccessLevel[minLevel].toLowerCase()
            const userLevel = AccessLevel[userAccess].toLowerCase()
            
            return createErrorResponse(
                c, 
                `Insufficient access level. Required: ${requiredLevel}, Current: ${userLevel}`,
                ApiErrorCode.NOT_FOUND,
                403
            )
        }
        
        // Store access level in context for route handlers
        c.set('userAccess', userAccess)
        
        return next()
    }
}

// Convenience middleware for common access levels
export const requireRead = requireAccess(AccessLevel.READ)
export const requireEdit = requireAccess(AccessLevel.EDIT)  
export const requireFull = requireAccess(AccessLevel.FULL)
export const requireRoot = requireAccess(AccessLevel.ROOT)

// Helper function for route handlers to check method-specific access
export function checkMethodAccess(c: Context, method: string): boolean {
    const userAccess: AccessLevel = c.get('userAccess') || AccessLevel.DENY
    
    switch (method.toUpperCase()) {
        case 'GET':
            return hasMinimumAccess(userAccess, AccessLevel.READ)
        case 'POST':
        case 'PUT': 
        case 'DELETE':
            return hasMinimumAccess(userAccess, AccessLevel.EDIT)
        default:
            return false
    }
}

// Create access error response for route handlers
export function createAccessError(c: Context, operation: string, requiredLevel: AccessLevel): Response {
    const userAccess: AccessLevel = c.get('userAccess') || AccessLevel.DENY
    const requiredLevelName = AccessLevel[requiredLevel].toLowerCase()
    const userLevelName = AccessLevel[userAccess].toLowerCase()
    
    return createErrorResponse(
        c,
        `Insufficient access for ${operation}. Required: ${requiredLevelName}, Current: ${userLevelName}`,
        ApiErrorCode.NOT_FOUND,
        403
    )
}