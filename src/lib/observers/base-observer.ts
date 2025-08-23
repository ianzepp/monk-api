/**
 * Base Observer Class
 * 
 * Provides the executeTry/execute pattern for consistent error handling,
 * logging, and timeout management across all observers.
 */

import type { Observer, ObserverContext } from './interfaces.js';
import type { ObserverRing, OperationType } from './types.js';
import { 
    ValidationError, 
    BusinessLogicError, 
    SystemError, 
    ValidationWarning,
    ObserverTimeoutError
} from './errors.js';

/**
 * Abstract base class for all observers
 * 
 * Provides:
 * - Error handling and categorization
 * - Execution time tracking and logging
 * - Timeout protection
 * - Consistent logging format
 */
export abstract class BaseObserver implements Observer {
    abstract readonly ring: ObserverRing;
    readonly operations?: readonly OperationType[];
    
    // Default timeout for observer execution (can be overridden)
    protected readonly timeoutMs: number = 5000; // 5 seconds
    
    /**
     * Public method - handles errors, timeouts, logging
     * 
     * This method should be called by the ObserverRunner. It wraps the
     * execute() method with consistent error handling and logging.
     */
    async executeTry(context: ObserverContext): Promise<void> {
        const startTime = Date.now();
        const observerName = this.constructor.name;
        
        try {
            // Execute with timeout protection
            await Promise.race([
                this.execute(context),
                this.createTimeoutPromise(observerName)
            ]);
            
            // Success logging
            const duration = Date.now() - startTime;
            console.debug(`✅ Observer executed: ${observerName} (ring ${this.ring}) - ${duration}ms`);
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.handleObserverError(error, observerName, context, duration);
        }
    }
    
    /**
     * Array processing method - handles multiple records
     * 
     * Default implementation processes each record through executeOne().
     * Override this method for complex observers that need custom array processing,
     * cross-record business logic, or performance optimizations.
     * 
     * Error handling guidelines:
     * - Throw ValidationError for invalid input data
     * - Throw BusinessLogicError for business rule violations  
     * - Throw SystemError for unrecoverable system failures
     * - Add warnings to context.warnings for non-blocking issues
     */
    async execute(context: ObserverContext): Promise<void> {
        // Default implementation: process each record sequentially
        for (const record of context.data) {
            await this.executeOne(record, context);
        }
    }
    
    /**
     * Single record processing method - override for simple field validation
     * 
     * This method is called for each record in the array by the default execute() implementation.
     * Use this for simple observers that validate/transform individual records.
     * 
     * For complex observers that need cross-record logic, override execute() instead.
     */
    async executeOne(record: any, context: ObserverContext): Promise<void> {
        // Default implementation: no-op
        // Observers can implement this for simple per-record processing
    }
    
    /**
     * Create timeout promise for observer execution
     */
    private createTimeoutPromise(observerName: string): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new ObserverTimeoutError(observerName, this.timeoutMs));
            }, this.timeoutMs);
        });
    }
    
    /**
     * Categorize and handle errors from observer execution
     */
    private handleObserverError(
        error: unknown, 
        observerName: string, 
        context: ObserverContext,
        duration: number
    ): void {
        if (error instanceof ValidationError) {
            // Recoverable validation errors - collect for user feedback
            context.errors.push(error);
            console.debug(`❌ Validation error in ${observerName}: ${error.message} (${duration}ms)`);
            
        } else if (error instanceof BusinessLogicError) {
            // Recoverable business logic errors - collect for user feedback
            context.errors.push(error);
            console.debug(`❌ Business logic error in ${observerName}: ${error.message} (${duration}ms)`);
            
        } else if (error instanceof SystemError || error instanceof ObserverTimeoutError) {
            // Unrecoverable system errors - should rollback entire transaction
            console.error(`💥 System error in ${observerName}: ${error.message} (${duration}ms)`);
            throw error; // Propagate to rollback transaction
            
        } else if (error instanceof Error) {
            // Unknown errors become warnings - don't block execution
            const warning = new ValidationWarning(
                `Observer ${observerName}: ${error.message}`,
                undefined,
                'UNKNOWN_ERROR'
            );
            context.warnings.push(warning);
            console.warn(`⚠️  Unknown error in ${observerName}: ${error.message} (${duration}ms)`);
            
        } else {
            // Non-Error objects become warnings
            const warning = new ValidationWarning(
                `Observer ${observerName}: ${String(error)}`,
                undefined, 
                'UNKNOWN_ERROR'
            );
            context.warnings.push(warning);
            console.warn(`⚠️  Unknown error in ${observerName}: ${String(error)} (${duration}ms)`);
        }
    }
    
    /**
     * Helper method to check if this observer should execute for the given operation
     */
    shouldExecute(operation: OperationType): boolean {
        return !this.operations || this.operations.includes(operation);
    }
    
    /**
     * Helper method for observers to validate required fields
     */
    protected validateRequiredFields(record: any, requiredFields: string[]): void {
        for (const field of requiredFields) {
            if (record[field] === undefined || record[field] === null || record[field] === '') {
                throw new ValidationError(`Required field '${field}' is missing or empty`, field);
            }
        }
    }
    
    /**
     * Helper method for observers to validate field format
     */
    protected validateFieldFormat(value: any, field: string, pattern: RegExp, errorMessage?: string): void {
        if (value && !pattern.test(String(value))) {
            const message = errorMessage || `Field '${field}' has invalid format`;
            throw new ValidationError(message, field);
        }
    }
}