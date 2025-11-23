/**
 * Change Tracker Observer
 *
 * Universal audit observer that tracks all data changes
 * Ring: 7 (Audit) - Model: % (all models) - Operations: create, update, delete
 *
 * TODO: Re-enable when audit_log table is added to init-tenant.sql
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { SystemError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class ChangeTracker extends BaseObserver {
    readonly ring = ObserverRing.Audit;
    readonly operations = ['create', 'update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { operation, model } = context;

        // TODO: Temporarily disabled for testing - re-enable when audit_log table is created
        console.info(`📝 Change tracker triggered for ${model.model_name} ${operation} (disabled for testing)`);

        // Early return - disabled for testing
        return;
    }

    private async createAuditRecord(context: ObserverContext): Promise<any> {
        const { system, operation, model, data } = context;

        const auditRecord: any = {
            // Core audit fields
            operation,
            model: model.model_name,
            record_id: this.getRecordId(data),
            user_id: system.getUser?.()?.id || 'system',
            timestamp: new Date().toISOString(),

            // Change details
            changes: this.computeChanges(operation, data),

            // Additional context (metadata removed - was never populated)
            metadata: null,

            // Request tracking
            request_id: this.generateRequestId(),
            session_id: this.getSessionId(system),
            ip_address: this.getClientIp(system),
            user_agent: this.getUserAgent(system),
        };

        // Add operation-specific fields (data contains ModelRecord instances)
        const records = (Array.isArray(data) ? data : [data]).filter((r): r is any => r != null);
        switch (operation) {
            case 'create':
                auditRecord.action = 'CREATE';
                auditRecord.new_values = records.map(r => r.toObject());
                break;

            case 'update':
                auditRecord.action = 'UPDATE';
                auditRecord.old_values = records.map(r => r.getOriginal ? r.getOriginal('*') : null);
                auditRecord.new_values = records.map(r => r.toObject());
                break;

            case 'delete':
                auditRecord.action = 'DELETE';
                auditRecord.old_values = records.map(r => r.getOriginal ? r.getOriginal('*') : r.toObject());
                auditRecord.soft_delete = false;
                break;
        }

        return auditRecord;
    }

    private computeChanges(operation: string, data: any): any {
        const records = Array.isArray(data) ? data : [data];
        switch (operation) {
            case 'create':
                return {
                    type: 'create',
                    fields_added: records.length > 0 ? Object.keys(records[0].toObject() || {}) : []
                };

            case 'update':
                if (!records || records.length === 0) return null;

                const changes: any = {
                    type: 'update',
                    fields_changed: [],
                    changes_detail: {}
                };

                // Use ModelRecord's getChanges() method
                const recordChanges = records[0].getChanges?.() || {};

                for (const [key, change] of Object.entries(recordChanges)) {
                    changes.fields_changed.push(key);
                    changes.changes_detail[key] = {
                        from: (change as any).old,
                        to: (change as any).new
                    };
                }

                return changes;

            case 'delete':
                return {
                    type: 'delete',
                    fields_removed: records.length > 0 ? Object.keys(records[0].toObject() || {}) : []
                };

            default:
                return null;
        }
    }


    private getRecordId(data: any): string | null {
        const records = Array.isArray(data) ? data : [data];
        return records.length > 0 ? records[0].get?.('id') || null : null;
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
