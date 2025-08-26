/**
 * Base Async Observer Class
 * 
 * Async observers execute outside the transaction context and don't block
 * the observer pipeline response. Ideal for post-database operations like
 * notifications, webhooks, cache invalidation, and audit logging.
 * 
 * Async observers:
 * - Execute via setImmediate() - don't block pipeline response
 * - Run outside transaction context - errors don't trigger rollback
 * - Failed executions logged via logger.warn() - no pipeline impact
 * - Perfect for Rings 6-9 (PostDatabase, Audit, Integration, Notification)
 */

import type { Observer, ObserverContext } from './interfaces.js';
import type { ObserverRing, OperationType } from './types.js';

/**
 * Abstract base class for async observers
 * 
 * Provides non-blocking execution pattern where observer runs asynchronously
 * after the main observer pipeline completes, ensuring fast API response times
 * while still executing necessary post-database operations.
 */
export abstract class BaseAsyncObserver implements Observer {
    abstract readonly ring: ObserverRing;
    readonly operations?: readonly OperationType[];
    
    // Default timeout for async observer execution (can be overridden)
    protected readonly timeoutMs: number = 10000; // 10 seconds for external operations
    
    /**
     * Async execution - starts observer execution but returns immediately
     * 
     * This method implements the async execution pattern by using setImmediate()
     * to schedule the observer execution outside the current event loop tick,
     * allowing the main pipeline to complete and respond quickly.
     */
    async executeTry(context: ObserverContext): Promise<void> {
        const startTime = process.hrtime.bigint();
        const observerName = this.constructor.name;
        const { system, operation, schemaName } = context;
        
        // Execute asynchronously - don't block pipeline
        setImmediate(async () => {
            try {
                // Execute with timeout protection for external operations
                await Promise.race([
                    this.execute(context),
                    this.createTimeoutPromise(observerName)
                ]);
                
                // Log successful async execution timing
                logger.time(`AsyncObserver: ${observerName}`, startTime, {
                    ring: this.ring,
                    operation,
                    schemaName,
                    status: 'success'
                });
                
            } catch (error) {
                // Log failed async execution timing
                logger.time(`AsyncObserver: ${observerName}`, startTime, {
                    ring: this.ring,
                    operation,
                    schemaName,
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error)
                });
                
                // Async errors are logged but don't affect transaction or response
                logger.warn(`Async observer failed: ${observerName}`, {
                    ring: this.ring,
                    operation,
                    schemaName,
                    error: error instanceof Error ? error.message : String(error),
                    timeout: this.timeoutMs
                });
            }
        });
        
        // Return immediately - pipeline continues without waiting
    }
    
    /**
     * Pure business logic method - implement this in your async observer
     * @param context Shared context with request data and state
     */
    abstract execute(context: ObserverContext): Promise<void>;
    
    /**
     * Create timeout promise for async observer execution
     */
    private createTimeoutPromise(observerName: string): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Async observer ${observerName} timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
        });
    }
    
    /**
     * Helper method to check if this observer should execute for the given operation
     */
    shouldExecute(operation: OperationType): boolean {
        return !this.operations || this.operations.includes(operation);
    }
}