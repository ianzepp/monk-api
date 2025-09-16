/**
 * Pipeline Framework - Main Entry Point
 *
 * Exports all observer framework components for use throughout the application.
 */

// Core interfaces and types
export type {
    Pipeline,
    PipelineContext,
    PipelineConstructor,
    PipelineStats,
    PipelineExecutionSummary
} from '@src/lib/pipeline/interfaces.js';

export {
    PipelineRing,
    DATABASE_RING,
    UNIVERSAL_SCHEMA_KEYWORD,
    RING_OPERATION_MATRIX
} from '@src/lib/pipeline/types.js';

export type {
    OperationType,
    PipelineResult,
    UniversalSchemaKeyword,
    PipelineFilePattern
} from '@src/lib/pipeline/types.js';

// Error types and base observer
export {
    ValidationError,
    BusinessLogicError,
    SystemError,
    ValidationWarning,
    PipelineTimeoutError,
    PipelineRecursionError
} from '@src/lib/pipeline/errors.js';

export { BaseObserver } from '@src/lib/pipeline/base-observer.js';

// Core implementation classes
export { PipelineLoader } from '@src/lib/pipeline/loader.js';
export { PipelineRunner } from '@src/lib/pipeline/runner.js';
