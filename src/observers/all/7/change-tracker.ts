/**
 * Change Tracker Observer
 * 
 * Universal audit observer that tracks all data changes
 * Ring: 7 (Audit) - Schema: % (all schemas) - Operations: create, update, delete
 */

import type { Observer, ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';

export default class ChangeTracker implements Observer {
    ring = ObserverRing.Audit;
    operations = ['create', 'update', 'delete'] as const;
    name = 'ChangeTracker';

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, schema, result, existing, data, metadata } = context;
        
        try {
            const auditRecord = await this.createAuditRecord(context);
            
            // Store audit record in audit_log table
            await system.database?.createOne('audit_log', auditRecord);
            
            // Add audit reference to metadata for other observers
            metadata.set('audit_logged', true);
            metadata.set('audit_timestamp', auditRecord.timestamp);
            
        } catch (error) {
            // Don't fail the main operation if audit logging fails
            console.warn(`Audit logging failed for ${schema} ${operation}:`, error);
            
            context.warnings.push({
                message: `Audit logging failed: ${error}`,
                code: 'AUDIT_LOGGING_FAILED',
                ring: this.ring,
                observer: this.name
            });
        }
    }

    private async createAuditRecord(context: ObserverContext): Promise<any> {
        const { system, operation, schema, result, existing, data, metadata } = context;
        
        const auditRecord: any = {
            // Core audit fields
            operation,
            schema,
            record_id: this.getRecordId(result, existing, data),
            user_id: system.getUser?.()?.id || 'system',
            timestamp: new Date().toISOString(),
            
            // Change details
            changes: this.computeChanges(operation, existing, result, data),
            
            // Additional context
            metadata: this.extractAuditMetadata(metadata),
            
            // Request tracking
            request_id: this.generateRequestId(),
            session_id: this.getSessionId(system),
            ip_address: this.getClientIp(system),
            user_agent: this.getUserAgent(system),
        };

        // Add operation-specific fields
        switch (operation) {
            case 'create':
                auditRecord.action = 'CREATE';
                auditRecord.new_values = result || data;
                break;
                
            case 'update':
                auditRecord.action = 'UPDATE';
                auditRecord.old_values = existing;
                auditRecord.new_values = result;
                break;
                
            case 'delete':
                auditRecord.action = 'DELETE';
                auditRecord.old_values = existing;
                auditRecord.soft_delete = metadata.get('soft_delete') || false;
                break;
        }

        return auditRecord;
    }

    private computeChanges(operation: string, existing: any, result: any, data: any): any {
        switch (operation) {
            case 'create':
                return {
                    type: 'create',
                    fields_added: Object.keys(result || data || {})
                };
                
            case 'update':
                if (!existing) return null;
                
                const changes: any = {
                    type: 'update',
                    fields_changed: [],
                    changes_detail: {}
                };
                
                const newData = result || data || {};
                
                for (const [key, newValue] of Object.entries(newData)) {
                    const oldValue = existing[key];
                    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                        changes.fields_changed.push(key);
                        changes.changes_detail[key] = {
                            from: oldValue,
                            to: newValue
                        };
                    }
                }
                
                return changes;
                
            case 'delete':
                return {
                    type: 'delete',
                    fields_removed: Object.keys(existing || {})
                };
                
            default:
                return null;
        }
    }

    private extractAuditMetadata(metadata: Map<string, any>): any {
        const auditMetadata: any = {};
        
        // Extract relevant metadata for audit trail
        const auditKeys = [
            'balance_change',
            'transaction_type',
            'requires_audit',
            'large_transaction',
            'role_change',
            'significant_role_change',
            'creator_role',
            'target_role'
        ];
        
        for (const key of auditKeys) {
            if (metadata.has(key)) {
                auditMetadata[key] = metadata.get(key);
            }
        }
        
        return Object.keys(auditMetadata).length > 0 ? auditMetadata : null;
    }

    private getRecordId(result: any, existing: any, data: any): string | null {
        return result?.id || existing?.id || data?.id || null;
    }

    private generateRequestId(): string {
        // In production, this should come from request context
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private getSessionId(system: any): string | null {
        // In production, extract from system/request context
        return system.getSessionId?.() || null;
    }

    private getClientIp(system: any): string | null {
        // In production, extract from request headers
        return system.getClientIp?.() || null;
    }

    private getUserAgent(system: any): string | null {
        // In production, extract from request headers
        return system.getUserAgent?.() || null;
    }
}