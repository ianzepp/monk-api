/**
 * Webhook Sender Observer
 *
 * Universal integration observer that sends webhooks for data changes
 * Ring: 8 (Integration) - Model: % (all models) - Operations: create, update, delete
 *
 * TODO: Re-enable when webhook endpoints are configured
 */

import { BaseAsyncObserver } from '@src/lib/observers/base-async-observer.js';
import { SystemError, ValidationWarning } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

interface WebhookEndpoint {
    url: string;
    models: string[];
    operations: string[];
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
}

export default class WebhookSender extends BaseAsyncObserver {
    readonly ring = ObserverRing.Integration;
    readonly operations = ['create', 'update', 'delete'] as const;

    // In a real implementation, this would come from database configuration
    private readonly webhookEndpoints: WebhookEndpoint[] = [
        {
            url: 'https://api.external-service.com/webhooks/data-changes',
            models: ['user', 'account'],
            operations: ['create', 'update', 'delete'],
            headers: {
                'Authorization': 'Bearer ${WEBHOOK_TOKEN}',
                'Content-Type': 'application/json'
            },
            timeout: 5000,
            retries: 3
        },
        {
            url: 'https://analytics.company.com/events',
            models: ['*'], // All models
            operations: ['create', 'delete'],
            timeout: 3000,
            retries: 1
        }
    ];

    async execute(context: ObserverContext): Promise<void> {
        const { model, operation } = context;

        // TODO: Temporarily disabled for testing - re-enable when webhook endpoints are configured
        console.info(`📡 Webhook observer triggered for ${model} ${operation} (disabled for testing)`);
    }

    private getApplicableEndpoints(model: string, operation: string): WebhookEndpoint[] {
        return this.webhookEndpoints.filter(endpoint => {
            // Check if model matches
            const modelMatches = endpoint.models.includes('*') ||
                                endpoint.models.includes(model);

            // Check if operation matches
            const operationMatches = endpoint.operations.includes(operation);

            return modelMatches && operationMatches;
        });
    }

    private async sendWebhook(endpoint: WebhookEndpoint, context: ObserverContext): Promise<any> {
        const payload = this.createWebhookPayload(context);
        const headers = this.processHeaders(endpoint.headers || {});

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), endpoint.timeout || 5000);

        try {
            console.debug(`📡 Sending webhook to: ${endpoint.url}`);

            const response = await fetch(endpoint.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.debug(`✅ Webhook sent successfully to: ${endpoint.url}`);
            return { success: true, status: response.status };

        } catch (error) {
            clearTimeout(timeout);

            // Implement retry logic
            if ((endpoint.retries || 0) > 0) {
                console.debug(`🔄 Retrying webhook to: ${endpoint.url}`);
                return this.retryWebhook(endpoint, context, error);
            }

            throw error;
        }
    }

    private async retryWebhook(endpoint: WebhookEndpoint, context: ObserverContext, lastError: any): Promise<any> {
        const maxRetries = endpoint.retries || 0;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));

                console.debug(`🔄 Webhook retry ${attempt}/${maxRetries} for: ${endpoint.url}`);
                return await this.sendWebhook({ ...endpoint, retries: 0 }, context);

            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                lastError = error;
            }
        }

        throw lastError;
    }

    private createWebhookPayload(context: ObserverContext): any {
        const { operation, model, data } = context;

        return {
            // Event metadata
            event: {
                type: `${model.model_name}.${operation}`,
                timestamp: new Date().toISOString(),
                source: 'monk-api',
                version: '1.0'
            },

            // Operation details
            operation,
            model: model.model_name,

            // Data payload based on operation type
            data: this.getDataPayload(operation, data),

            // Additional context from observers
            context: {
                user_id: context.system.getUser?.()?.id || null,
                metadata: null
            }
        };
    }

    private getDataPayload(operation: string, data: any): any {
        // data is ModelRecord[] with both original and current state
        const records = Array.isArray(data) ? data : (data ? [data] : []);
        const recordData = records.map(r => r.toObject());

        switch (operation) {
            case 'create':
                return {
                    record: recordData
                };

            case 'update':
                // Extract changes from ModelRecord instances
                const changes = records.map(r => ({
                    record: r.toObject(),
                    changes: r.getChanges()
                }));
                return { updates: changes };

            case 'delete':
                return {
                    record: recordData,
                    soft_delete: true // Assuming soft deletes
                };

            default:
                return { record: recordData };
        }
    }

    private computeChanges(record: any): any {
        // No longer needed - ModelRecord.getChanges() handles this
        return record.getChanges?.() || null;
    }

    private _computeChangesOld(existing: any, result: any): any {
        if (!existing || !result) return null;

        const changes: any = {};

        for (const [key, newValue] of Object.entries(result)) {
            const oldValue = existing[key];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changes[key] = {
                    from: oldValue,
                    to: newValue
                };
            }
        }

        return Object.keys(changes).length > 0 ? changes : null;
    }

    private processHeaders(headers: Record<string, string>): Record<string, string> {
        const processed: Record<string, string> = {};

        for (const [key, value] of Object.entries(headers)) {
            // Replace environment variable placeholders
            processed[key] = value.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
                return process.env[envVar] || match;
            });
        }

        return processed;
    }

}
