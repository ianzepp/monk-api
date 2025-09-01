/**
 * Shared types and interfaces for File API system
 * 
 * This file contains all shared interfaces, enums, and types used across
 * File API routes to eliminate duplication and ensure consistency.
 * 
 * Following the established patterns from Filter system refactoring.
 */

// ===========================
// Core File API Types
// ===========================

export type FileType = 'd' | 'f' | 'l'; // Directory, File, Link
export type FilePermissions = 'rwx' | 'rw-' | 'r--' | 'r-x' | '---';
export type AccessLevel = 'read' | 'edit' | 'full' | 'none';

export interface FileEntry {
    name: string;
    file_type: FileType;
    file_size: number;
    file_permissions: FilePermissions;
    file_modified: string; // YYYYMMDDHHMMSS format
    path: string;
    api_context: {
        schema: string;
        record_id?: string;
        field_name?: string;
        access_level: AccessLevel;
    };
}

export interface FileMetadata {
    path: string;
    type: 'file' | 'directory';
    permissions: FilePermissions;
    size: number;
    modified_time: string;
    created_time?: string;
    access_time?: string;
    content_type?: string;
    etag?: string;
    can_resume?: boolean;
}

// ===========================
// Path Parsing Types
// ===========================

export type FilePathType = 'root' | 'data' | 'meta' | 'schema' | 'record' | 'field';
export type FileOperationType = 'list' | 'retrieve' | 'store' | 'delete' | 'stat' | 'size' | 'modify-time';

export interface FilePath {
    type: FilePathType;
    operation: FileOperationType;
    schema?: string;
    record_id?: string;
    field_name?: string;
    is_json_file?: boolean;
    is_directory?: boolean;
    has_wildcards?: boolean;
    is_cross_schema?: boolean;
    raw_path: string;
    normalized_path: string;
}

export interface FilePathOptions {
    operation: FileOperationType;
    allowWildcards?: boolean;
    allowCrossSchema?: boolean;
    requireFile?: boolean; // For SIZE/MDTM operations
    allowDangerous?: boolean; // For schema-level operations
}

// ===========================
// Request/Response Types
// ===========================

export interface FileListRequest {
    path: string;
    file_options?: {
        show_hidden?: boolean;
        long_format?: boolean;
        recursive?: boolean;
        max_depth?: number;
        sort_by?: 'name' | 'date' | 'size';
        sort_order?: 'asc' | 'desc';
        pattern_optimization?: boolean;
        cross_schema_limit?: number;
        use_pattern_cache?: boolean;
    };
}

export interface FileRetrieveRequest {
    path: string;
    file_options?: {
        binary_mode?: boolean;
        start_offset?: number;
        max_bytes?: number;
        format?: 'json' | 'raw';
    };
}

export interface FileStoreRequest {
    path: string;
    content: any;
    file_options?: {
        binary_mode?: boolean;
        overwrite?: boolean;
        append_mode?: boolean;
        create_path?: boolean;
        atomic?: boolean;
        validate_schema?: boolean;
    };
}

export interface FileDeleteRequest {
    path: string;
    file_options?: {
        recursive?: boolean;
        force?: boolean;
        permanent?: boolean;
        atomic?: boolean;
    };
    safety_checks?: {
        require_empty?: boolean;
        max_deletions?: number;
    };
}

export interface FileStatRequest {
    path: string;
}

export interface FileSizeRequest {
    path: string;
}

export interface FileModifyTimeRequest {
    path: string;
}

// ===========================
// Response Types
// ===========================

export interface FileListResponse {
    success: true;
    entries: FileEntry[];
    total: number;
    has_more: boolean;
    file_metadata: FileMetadata;
}

export interface FileRetrieveResponse {
    success: true;
    content: any;
    file_metadata: FileMetadata;
}

export interface FileStoreResponse {
    success: true;
    operation: 'create' | 'update' | 'append' | 'field_update';
    result: {
        record_id: string;
        field_name?: string;
        created: boolean;
        updated: boolean;
        validation_passed: boolean;
    };
    file_metadata: FileMetadata;
}

export interface FileDeleteResponse {
    success: true;
    operation: 'soft_delete' | 'permanent_delete' | 'field_delete';
    results: {
        deleted_count: number;
        paths: string[];
        records_affected: string[];
        fields_cleared?: string[];
    };
    file_metadata: {
        can_restore: boolean;
        restore_deadline?: string;
    };
}

export interface FileStatResponse {
    success: true;
    file_metadata: FileMetadata;
    record_info: {
        schema: string;
        record_id?: string;
        field_name?: string;
        field_count?: number;
        soft_deleted: boolean;
        access_permissions: string[];
    };
    children_count?: number;
    schema_info?: {
        description?: string;
        record_count: number;
        field_definitions: Array<{
            name: string;
            type: string;
            required: boolean;
            constraints?: string;
            description?: string;
        }>;
    };
}

export interface FileSizeResponse {
    success: true;
    size: number;
    file_metadata: FileMetadata;
}

export interface FileModifyTimeResponse {
    success: true;
    modified_time: string;
    file_metadata: FileMetadata;
    timestamp_info: {
        source: 'updated_at' | 'created_at' | 'current_time';
        iso_timestamp: string;
        timezone: 'UTC';
    };
}

// ===========================
// Permission Types
// ===========================

export interface FilePermissionResult {
    allowed: boolean;
    reason: string;
    details?: string;
    permissions: FilePermissions;
    access_level: AccessLevel;
}

export interface FilePermissionContext {
    user_id: string;
    user_groups: string[];
    is_root: boolean;
    operation: FileOperationType;
    path: FilePath;
}