import type { FindWhere } from './find.js';

export interface FileMetadata {
  path: string;
  type: 'file' | 'directory';
  permissions: string;
  size: number;
  modified_time: string;
  created_time?: string;
  access_time?: string;
  content_type?: string;
  etag?: string;
  can_resume?: boolean;
  can_restore?: boolean;
}

export interface FileEntry {
  name: string;
  file_type: 'f' | 'd';
  file_size: number;
  file_permissions: string;
  file_modified: string;
  path: string;
  api_context?: {
    schema?: string;
    record_id?: string;
    field_name?: string;
    access_level?: string;
  };
  created_time?: string;
  content_type?: string;
  etag?: string;
  soft_deleted?: boolean;
  field_count?: number;
}

export interface ListOptions {
  show_hidden?: boolean;
  long_format?: boolean;
  recursive?: boolean;
  flat?: boolean;
  max_depth?: number;
  sort_by?: 'name' | 'size' | 'time' | 'type';
  sort_order?: 'asc' | 'desc';
  where?: FindWhere;
  cross_schema_limit?: number;
  pattern_optimization?: boolean;
  use_pattern_cache?: boolean;
}

export interface ListResponse {
  entries: FileEntry[];
  total: number;
  has_more: boolean;
  file_metadata: FileMetadata;
}

export interface RetrieveOptions {
  format?: 'json' | 'raw';
  start_offset?: number;
  max_bytes?: number;
  show_hidden?: boolean;
}

export interface RetrieveResponse<T = any> {
  content: T;
  file_metadata: FileMetadata;
}

export interface StoreOptions {
  overwrite?: boolean;
  append_mode?: boolean;
  validate_schema?: boolean;
}

export interface StoreResponse {
  operation: string;
  result: {
    record_id?: string;
    field_name?: string;
    created: boolean;
    updated: boolean;
    validation_passed?: boolean;
  };
  file_metadata: FileMetadata;
}

export interface DeleteOptions {
  permanent?: boolean;
}

export interface DeleteResponse {
  operation: string;
  results: {
    deleted_count: number;
    paths: string[];
    records_affected?: string[];
    fields_cleared?: string[];
  };
  file_metadata?: {
    can_restore?: boolean;
  };
}

export interface StatResponse {
  file_metadata: FileMetadata;
  record_info?: {
    schema: string;
    record_id?: string;
    field_name?: string;
    soft_deleted: boolean;
    access_permissions: string[];
  };
  schema_info?: {
    [key: string]: any;
  };
}

export interface SizeResponse {
  size: number;
  file_metadata: FileMetadata;
}

export interface ModifyTimeResponse {
  modified_time: string;
  file_metadata: FileMetadata;
  timestamp_info?: {
    source: string;
    iso_timestamp: string;
    timezone: string;
  };
}
