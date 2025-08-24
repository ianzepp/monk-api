/**
 * Observer Framework - Main Entry Point
 * 
 * Exports all observer framework components for use throughout the application.
 */

// Core interfaces and types
export type { 
    Observer, 
    ObserverContext, 
    ObserverConstructor,
    ObserverStats,
    ObserverExecutionSummary 
} from './interfaces.js';

export { 
    ObserverRing,
    DATABASE_RING,
    UNIVERSAL_SCHEMA_KEYWORD,
    RING_OPERATION_MATRIX
} from './types.js';

export type { 
    OperationType, 
    ObserverResult,
    UniversalSchemaKeyword,
    ObserverFilePattern 
} from './types.js';

// Error types and base observer
export { 
    ValidationError,
    BusinessLogicError, 
    SystemError,
    ValidationWarning,
    ObserverTimeoutError,
    ObserverRecursionError
} from './errors.js';

export { BaseObserver } from './base-observer.js';

// Core implementation classes
export { ObserverLoader } from './loader.js';
export { ObserverRunner } from './runner.js';