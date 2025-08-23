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
    UNIVERSAL_SCHEMA_KEYWORD
} from './types.js';

export type { 
    OperationType, 
    ValidationError, 
    ValidationWarning, 
    ObserverResult,
    UniversalSchemaKeyword,
    ObserverFilePattern 
} from './types.js';

// Core implementation classes
export { ObserverLoader } from './loader.js';
export { ObserverRunner } from './runner.js';