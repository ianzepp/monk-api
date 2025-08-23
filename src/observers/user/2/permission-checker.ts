/**
 * User Permission Checker
 * 
 * Business logic validator for user permission operations
 * Ring: 2 (Business) - Schema: user - Operations: create, update
 */

import type { Observer, ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';

export default class PermissionChecker implements Observer {
    ring = ObserverRing.Business;
    operations = ['create', 'update'] as const;
    name = 'PermissionChecker';

    // Define role hierarchy (higher number = more permissions)
    private readonly roleHierarchy: Record<string, number> = {
        'guest': 0,
        'user': 10,
        'moderator': 20,
        'admin': 30,
        'superadmin': 40
    };

    async execute(context: ObserverContext): Promise<void> {
        const { data, existing, operation, system } = context;
        
        if (!data) return;

        // Get current user role from system
        const currentUserRole = await this.getCurrentUserRole(system);
        const currentUserLevel = this.roleHierarchy[currentUserRole] || 0;

        if (operation === 'create') {
            await this.validateUserCreation(context, currentUserLevel);
        } else if (operation === 'update') {
            await this.validateUserUpdate(context, currentUserLevel);
        }
    }

    private async validateUserCreation(context: ObserverContext, currentUserLevel: number): Promise<void> {
        const { data } = context;
        
        const targetRole = data.role || 'user';
        const targetLevel = this.roleHierarchy[targetRole] || 0;

        // Business rule: Users cannot create accounts with higher privileges than themselves
        if (targetLevel >= currentUserLevel) {
            context.errors.push({
                message: `Insufficient permissions to create user with role: ${targetRole}`,
                field: 'role',
                code: 'INSUFFICIENT_PERMISSIONS',
                ring: this.ring,
                observer: this.name
            });
        }

        // Business rule: Only admins+ can create admin users
        if (targetLevel >= this.roleHierarchy['admin'] && currentUserLevel < this.roleHierarchy['admin']) {
            context.errors.push({
                message: 'Admin privileges required to create admin users',
                field: 'role',
                code: 'ADMIN_REQUIRED',
                ring: this.ring,
                observer: this.name
            });
        }

        // Store permission context for audit
        context.metadata.set('creator_role', this.getRoleByLevel(currentUserLevel));
        context.metadata.set('target_role', targetRole);
    }

    private async validateUserUpdate(context: ObserverContext, currentUserLevel: number): Promise<void> {
        const { data, existing } = context;
        
        if (!existing) return;

        const currentRole = existing.role || 'user';
        const newRole = data.role;
        
        // If role isn't changing, check other permission-sensitive fields
        if (!newRole || newRole === currentRole) {
            await this.validateOtherPermissions(context, currentUserLevel);
            return;
        }

        const currentTargetLevel = this.roleHierarchy[currentRole] || 0;
        const newTargetLevel = this.roleHierarchy[newRole] || 0;

        // Business rule: Cannot modify users with equal or higher privileges
        if (currentTargetLevel >= currentUserLevel) {
            context.errors.push({
                message: 'Insufficient permissions to modify this user',
                code: 'INSUFFICIENT_PERMISSIONS_MODIFY',
                ring: this.ring,
                observer: this.name
            });
            return;
        }

        // Business rule: Cannot promote users to equal or higher level
        if (newTargetLevel >= currentUserLevel) {
            context.errors.push({
                message: `Insufficient permissions to promote user to role: ${newRole}`,
                field: 'role',
                code: 'INSUFFICIENT_PERMISSIONS_PROMOTE',
                ring: this.ring,
                observer: this.name
            });
        }

        // Audit significant role changes
        if (Math.abs(newTargetLevel - currentTargetLevel) >= 10) {
            context.metadata.set('significant_role_change', true);
            context.metadata.set('role_change', {
                from: currentRole,
                to: newRole,
                level_change: newTargetLevel - currentTargetLevel
            });
        }
    }

    private async validateOtherPermissions(context: ObserverContext, currentUserLevel: number): Promise<void> {
        const { data, existing } = context;
        
        // Business rule: Only admins can modify sensitive fields
        const sensitiveFields = ['permissions', 'access_level', 'api_key'];
        const adminRequired = sensitiveFields.some(field => field in data);
        
        if (adminRequired && currentUserLevel < this.roleHierarchy['admin']) {
            context.errors.push({
                message: 'Admin privileges required to modify sensitive user fields',
                code: 'ADMIN_REQUIRED_SENSITIVE_FIELDS',
                ring: this.ring,
                observer: this.name
            });
        }

        // Business rule: Users can only modify their own non-sensitive data
        const targetUserId = existing.id;
        const currentUserId = context.system.getUser?.()?.id || null;
        
        if (targetUserId !== currentUserId && currentUserLevel < this.roleHierarchy['moderator']) {
            context.errors.push({
                message: 'Insufficient permissions to modify other users',
                code: 'INSUFFICIENT_PERMISSIONS_OTHER_USER',
                ring: this.ring,
                observer: this.name
            });
        }
    }

    private async getCurrentUserRole(system: any): Promise<string> {
        // In a real implementation, this would get the role from JWT or user context
        // For now, return a default role
        return 'admin'; // Placeholder - should come from system.getUserRole() or similar
    }

    private getRoleByLevel(level: number): string {
        return Object.entries(this.roleHierarchy)
            .find(([, roleLevel]) => roleLevel === level)?.[0] || 'unknown';
    }
}