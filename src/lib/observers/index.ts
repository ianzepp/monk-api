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
} from '@src/lib/observers/interfaces.js';

export { 
    ObserverRing,
    DATABASE_RING,
    UNIVERSAL_SCHEMA_KEYWORD,
    RING_OPERATION_MATRIX
} from '@src/lib/observers/types.js';

export type { 
    OperationType, 
    ObserverResult,
    UniversalSchemaKeyword,
    ObserverFilePattern 
} from '@src/lib/observers/types.js';

// Error types and base observer
export { 
    ValidationError,
    BusinessLogicError, 
    SystemError,
    ValidationWarning,
    ObserverTimeoutError,
    ObserverRecursionError
} from '@src/lib/observers/errors.js';

export { BaseObserver } from '@src/lib/observers/base-observer.js';

// Core implementation classes
export { ObserverLoader } from '@src/lib/observers/loader.js';
export { ObserverRunner } from '@src/lib/observers/runner.js';
export { ObserverValidator } from '@src/lib/observers/validator.js';