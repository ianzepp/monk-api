/**
 * File API Components - Barrel Export
 *
 * Clean component organization for File filesystem-like interface.
 * Provides shared utilities for all File API route handlers.
 */

export { FilePathParser } from './file-path-parser.js';
export { FilePermissionValidator } from './file-permission-validator.js';
export { FileTimestampFormatter } from './file-timestamp-formatter.js';
export { FileContentCalculator } from './file-content-calculator.js';
export { filterRecordFields, isHiddenField, getVisibleFieldNames } from './file-record-filter.js';

export type {
    // Core types
    FileType,
    FilePermissions,
    AccessLevel,
    FileEntry,
    FileMetadata,
    FilePath,
    FilePathOptions,
    FileOperationType,
    FilePathType,

    // Request types
    FileListRequest,
    FileRetrieveRequest,
    FileStoreRequest,
    FileDeleteRequest,
    FileStatRequest,
    FileSizeRequest,
    FileModifyTimeRequest,

    // Response types
    FileListResponse,
    FileRetrieveResponse,
    FileStoreResponse,
    FileDeleteResponse,
    FileStatResponse,
    FileSizeResponse,
    FileModifyTimeResponse,

    // Permission types
    FilePermissionResult,
    FilePermissionContext,
} from './file-types.js';