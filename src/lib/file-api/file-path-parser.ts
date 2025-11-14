import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';
import type { FilePath, FilePathOptions, FilePathType, FileOperationType } from '@src/lib/file-api/file-types.js';

/**
 * FilePathParser - Unified path parsing for File API operations
 *
 * The authoritative implementation for File filesystem path parsing with
 * operation-specific validation and wildcard support. Follows the established
 * patterns from FilterWhere for validation and error handling.
 *
 * Features: Flexible operation modes, wildcard detection, cross-schema support,
 * comprehensive validation, and proper error reporting.
 *
 * Quick Examples:
 * - List: `FilePathParser.parse('/data/users/', { operation: 'list' })`
 * - Store: `FilePathParser.parse('/data/users/123.json', { operation: 'store' })`
 * - Size: `FilePathParser.parse('/data/users/123.json', { operation: 'size', requireFile: true })`
 */
export class FilePathParser {
    /**
     * Parse file path with operation-specific validation
     * This is the authoritative entry point for all File path parsing
     */
    static parse(path: string, options: FilePathOptions): FilePath {
        try {
            // Validate the path before processing
            FilePathParser.validatePath(path, options);

            return FilePathParser.parsePath(path, options);
        } catch (error) {
            logger.warn('FilePathParser validation failed', {
                path,
                operation: options.operation,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Public validation method for external use
     * Allows other classes to validate paths without parsing
     */
    static validate(path: string, options: FilePathOptions): void {
        FilePathParser.validatePath(path, options);
    }

    /**
     * Validate path structure and operation-specific requirements
     * Centralized validation logic where path parsing implementation lives
     */
    private static validatePath(path: string, options: FilePathOptions): void {
        if (!path || typeof path !== 'string') {
            throw HttpErrors.badRequest('Path must be a non-empty string', 'INVALID_PATH');
        }

        if (path.length > 1000) {
            throw HttpErrors.badRequest('Path too long (max 1000 characters)', 'PATH_TOO_LONG');
        }

        // Basic path format validation
        if (!path.startsWith('/')) {
            throw HttpErrors.badRequest('Path must start with /', 'INVALID_PATH_FORMAT');
        }

        // Check for dangerous path components
        if (path.includes('..') || path.includes('//')) {
            throw HttpErrors.badRequest('Path contains invalid components', 'INVALID_PATH_COMPONENTS');
        }

        // Operation-specific validation
        FilePathParser.validateOperationRequirements(path, options);
    }

    /**
     * Validate operation-specific path requirements
     */
    private static validateOperationRequirements(path: string, options: FilePathOptions): void {
        const hasWildcards = path.includes('*') || path.includes('?') || path.includes('(') || path.includes('[');

        // Check wildcard permissions
        if (hasWildcards && !options.allowWildcards) {
            throw HttpErrors.badRequest(`Wildcards not allowed for ${options.operation} operation`, 'WILDCARDS_NOT_ALLOWED');
        }

        // Check file-only requirements (SIZE, MDTM)
        if (options.requireFile) {
            if (path.endsWith('/')) {
                throw HttpErrors.badRequest(`${options.operation.toUpperCase()} command only works on files, not directories`, 'NOT_A_FILE');
            }

            if (hasWildcards) {
                throw HttpErrors.badRequest(`${options.operation.toUpperCase()} command does not support wildcards`, 'WILDCARDS_NOT_SUPPORTED');
            }
        }
    }

    /**
     * Core path parsing implementation
     */
    private static parsePath(path: string, options: FilePathOptions): FilePath {
        const cleanPath = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        const parts = cleanPath.split('/').filter(p => p.length > 0);

        const hasWildcards = path.includes('*') || path.includes('?') || path.includes('(') || path.includes('[');
        const isCrossSchema = hasWildcards && parts.length >= 2 && parts[1].includes('*');

        // Root path: /
        if (parts.length === 0) {
            return {
                type: 'root',
                operation: options.operation,
                is_directory: true,
                has_wildcards: false,
                is_cross_schema: false,
                raw_path: path,
                normalized_path: '/',
            };
        }

        // Validate API prefix
        if (parts[0] !== 'data' && parts[0] !== 'describe') {
            throw HttpErrors.badRequest('Path must start with /data or /describe', 'INVALID_API_PREFIX');
        }

        // API root: /data or /describe
        if (parts.length === 1) {
            return {
                type: parts[0] as 'data' | 'describe',
                operation: options.operation,
                is_directory: true,
                has_wildcards: false,
                is_cross_schema: false,
                raw_path: path,
                normalized_path: cleanPath,
            };
        }

        // Schema level: /data/users
        if (parts.length === 2) {
            FilePathParser.validateSchemaName(parts[1]);

            return {
                type: 'schema',
                operation: options.operation,
                schema: parts[1],
                is_directory: true,
                has_wildcards: hasWildcards,
                is_cross_schema: isCrossSchema,
                raw_path: path,
                normalized_path: cleanPath,
            };
        }

        // Record/Field level: /data/users/123 or /describe/users/email
        // This represents either a record directory (data) or field definition (describe)
        if (parts.length === 3) {
            FilePathParser.validateSchemaName(parts[1]);
            FilePathParser.validateRecordId(parts[2]);

            // Check dangerous operations
            if (options.operation === 'delete' && parts[1].includes('*') && !options.allowDangerous) {
                throw HttpErrors.badRequest('Cross-schema deletion requires force flag', 'DANGEROUS_OPERATION');
            }

            return {
                type: 'record',
                operation: options.operation,
                schema: parts[1],
                record_id: parts[2],
                is_directory: true,
                has_wildcards: hasWildcards,
                is_cross_schema: isCrossSchema,
                raw_path: path,
                normalized_path: cleanPath,
            };
        }

        // Field/Property level: /data/users/123/email or /describe/users/email/maxLength
        if (parts.length === 4) {
            FilePathParser.validateSchemaName(parts[1]);
            FilePathParser.validateRecordId(parts[2]);
            FilePathParser.validateFieldName(parts[3]);

            return {
                type: 'field',
                operation: options.operation,
                schema: parts[1],
                record_id: parts[2],
                field_name: parts[3],
                is_directory: false,
                has_wildcards: hasWildcards,
                is_cross_schema: isCrossSchema,
                raw_path: path,
                normalized_path: cleanPath,
            };
        }

        // Property level and beyond: /describe/users/email/maxLength/... or /data/users/123/metadata/tags/...
        // Support unlimited depth for nested properties
        if (parts.length >= 5) {
            FilePathParser.validateSchemaName(parts[1]);
            FilePathParser.validateRecordId(parts[2]);
            FilePathParser.validateFieldName(parts[3]);

            // All remaining parts are property path components
            const propertyPath = parts.slice(4);

            // Validate each property name
            for (const prop of propertyPath) {
                FilePathParser.validatePropertyName(prop);
            }

            return {
                type: 'property',
                operation: options.operation,
                schema: parts[1],
                record_id: parts[2],
                field_name: parts[3],
                property_path: propertyPath,
                is_directory: false,
                has_wildcards: hasWildcards,
                is_cross_schema: isCrossSchema,
                raw_path: path,
                normalized_path: cleanPath,
            };
        }

        throw HttpErrors.badRequest(`Invalid path format: ${path}`, 'INVALID_PATH_FORMAT');
    }

    /**
     * Validate schema name format
     */
    private static validateSchemaName(schema: string): void {
        if (!schema || typeof schema !== 'string') {
            throw HttpErrors.badRequest('Schema name must be a non-empty string', 'INVALID_SCHEMA_NAME');
        }

        // Allow wildcards in schema names for cross-schema operations
        if (!schema.includes('*') && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
            throw HttpErrors.badRequest(`Invalid schema name format: ${schema}`, 'INVALID_SCHEMA_FORMAT');
        }
    }

    /**
     * Validate record ID format
     */
    private static validateRecordId(recordId: string): void {
        if (!recordId || typeof recordId !== 'string') {
            throw HttpErrors.badRequest('Record ID must be a non-empty string', 'INVALID_RECORD_ID');
        }

        // Allow wildcards in record IDs for pattern matching
        if (!recordId.includes('*') && recordId.length > 100) {
            throw HttpErrors.badRequest('Record ID too long (max 100 characters)', 'RECORD_ID_TOO_LONG');
        }
    }

    /**
     * Validate field name format
     */
    private static validateFieldName(fieldName: string): void {
        if (!fieldName || typeof fieldName !== 'string') {
            throw HttpErrors.badRequest('Field name must be a non-empty string', 'INVALID_FIELD_NAME');
        }

        // Field names must be valid identifiers (no wildcards supported)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
            throw HttpErrors.badRequest(`Invalid field name format: ${fieldName}`, 'INVALID_FIELD_FORMAT');
        }
    }

    /**
     * Validate property name format (for schema field properties)
     */
    private static validatePropertyName(propertyName: string): void {
        if (!propertyName || typeof propertyName !== 'string') {
            throw HttpErrors.badRequest('Property name must be a non-empty string', 'INVALID_PROPERTY_NAME');
        }

        // Property names must be valid identifiers (same rules as field names)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(propertyName)) {
            throw HttpErrors.badRequest(`Invalid property name format: ${propertyName}`, 'INVALID_PROPERTY_FORMAT');
        }
    }

    /**
     * Check if path has wildcards
     */
    static hasWildcards(path: string): boolean {
        return path.includes('*') || path.includes('?') || path.includes('(') || path.includes('[');
    }

    /**
     * Normalize path format
     */
    static normalize(path: string): string {
        return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }

    /**
     * Extract wildcard components from path
     */
    static extractWildcards(path: string): string[] {
        const parts = path.split('/').filter(p => p.length > 0);
        return parts.filter(part =>
            part.includes('*') || part.includes('?') || part.includes('(') || part.includes('[')
        );
    }
}
