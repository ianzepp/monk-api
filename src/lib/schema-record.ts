import type { Schema } from '@src/lib/schema.js';

/**
 * First-class record object that wraps data being created/updated
 * and tracks changes against original database state.
 *
 * Features:
 * - Holds both current (new/changed) and original (from DB) data
 * - Tracks field-level changes with shallow comparison
 * - Validates field writes against schema
 * - Provides diff/rollback/clone capabilities
 * - Knows its schema for validation and metadata access
 */
export class SchemaRecord {
    readonly schema: Schema;
    private _current: Record<string, any>;
    private _original: Record<string, any> | null;

    /**
     * Create a new SchemaRecord wrapping input data
     * @param schema The schema this record belongs to
     * @param data The input data (for creates/updates)
     */
    constructor(schema: Schema, data: Record<string, any>) {
        this.schema = schema;
        this._current = { ...data };  // Shallow copy
        this._original = null;  // Will be set by RecordPreloader for updates
    }

    /**
     * Load existing record data from the database
     * Called by RecordPreloader observer for update/delete/revert operations
     * @param existingData The record data loaded from database
     */
    load(existingData: Record<string, any>): void {
        if (this._original !== null) {
            console.warn('SchemaRecord.load() called multiple times', {
                schema: this.schema.schema_name,
                id: this._current.id
            });
        }
        this._original = Object.freeze({ ...existingData });
    }

    /**
     * Check if this is a new record (no original data loaded)
     * @returns true for CREATE operations, false for UPDATE/DELETE
     */
    isNew(): boolean {
        return this._original === null;
    }

    /**
     * Get the current value of a field
     * @param field The field name
     * @returns The current value, or undefined if not set
     */
    get(field: string): any {
        return this._current[field];
    }

    /**
     * Set the current value of a field
     * Validates against schema if field is not recognized
     * @param field The field name
     * @param value The value to set
     */
    set(field: string, value: any): void {
        // Validate field exists in schema (cheap check)
        if (!this.schema.hasColumn(field)) {
            console.warn('Setting unknown field on SchemaRecord', {
                schema: this.schema.schema_name,
                field,
                knownFields: Array.from(this.schema.getTypedFields().keys())
            });
        }

        this._current[field] = value;
    }

    /**
     * Replace entire current state with new data (used by SQL observers after DB operations)
     * Updates _current with final database state (e.g., updated timestamps, generated IDs)
     * Preserves _original for change tracking
     * @param data The complete record data from database
     */
    setCurrent(data: Record<string, any>): void {
        this._current = { ...data };
    }

    /**
     * Check if a field exists in the current data
     * @param field The field name
     * @returns true if field exists (even if undefined)
     */
    has(field: string): boolean {
        return field in this._current;
    }

    /**
     * Check if a field has changed from its original value
     * Uses shallow comparison (reference equality)
     * @param field The field name
     * @returns true if field changed, or true for new records
     */
    changed(field: string): boolean {
        // New records: all fields are "changed"
        if (this._original === null) {
            return field in this._current;
        }

        // Shallow comparison
        return this._current[field] !== this._original[field];
    }

    /**
     * Get all field changes as old/new pairs
     * @returns Object mapping field names to {old, new} values
     */
    getChanges(): Record<string, { old: any; new: any }> {
        const changes: Record<string, { old: any; new: any }> = {};

        if (this._original === null) {
            // For creates, all current fields are "changes" from null
            for (const key of Object.keys(this._current)) {
                changes[key] = { old: null, new: this._current[key] };
            }
            return changes;
        }

        // For updates, compare all current fields
        for (const key of Object.keys(this._current)) {
            if (this._current[key] !== this._original[key]) {
                changes[key] = {
                    old: this._original[key],
                    new: this._current[key]
                };
            }
        }

        return changes;
    }

    /**
     * Get the original value of a field (before changes)
     * @param field The field name
     * @returns The original value, or undefined if new record or field didn't exist
     */
    getOriginal(field: string): any {
        return this._original?.[field];
    }

    /**
     * Check if any fields have changed
     * @returns true if any field is different from original
     */
    hasChanges(): boolean {
        if (this._original === null) {
            return Object.keys(this._current).length > 0;
        }

        for (const key of Object.keys(this._current)) {
            if (this._current[key] !== this._original[key]) {
                return true;
            }
        }

        return false;
    }

    /**
     * Alias for hasChanges()
     */
    isChanged(): boolean {
        return this.hasChanges();
    }

    /**
     * Get list of field names that have changed
     * @returns Array of field names
     */
    getChangedFields(): string[] {
        if (this._original === null) {
            return Object.keys(this._current);
        }

        const changedFields: string[] = [];
        for (const key of Object.keys(this._current)) {
            if (this._current[key] !== this._original[key]) {
                changedFields.push(key);
            }
        }

        return changedFields;
    }

    /**
     * Alias for getChangedFields()
     * Useful for SQL UPDATE statements that only update changed fields
     */
    diff(): string[] {
        return this.getChangedFields();
    }

    /**
     * Rollback changes to original values
     * @param field Optional field name to rollback; if omitted, rollback all fields
     */
    rollback(field?: string): void {
        if (this._original === null) {
            if (field) {
                delete this._current[field];
            } else {
                this._current = {};
            }
            return;
        }

        if (field) {
            // Rollback single field
            if (field in this._original) {
                this._current[field] = this._original[field];
            } else {
                delete this._current[field];
            }
        } else {
            // Rollback all fields
            this._current = { ...this._original };
        }
    }

    /**
     * Create a copy of this record
     * @returns New SchemaRecord with same schema and cloned data
     */
    clone(): SchemaRecord {
        const cloned = new SchemaRecord(this.schema, this._current);
        if (this._original !== null) {
            cloned.load({ ...this._original });
        }
        return cloned;
    }

    /**
     * Convert to plain object for SQL operations
     * Merges original and current data (current overrides original)
     * @returns Merged plain object
     */
    toObject(): Record<string, any> {
        if (this._original === null) {
            return { ...this._current };
        }

        return { ...this._original, ...this._current };
    }

    /**
     * Convert to JSON for debugging/logging
     * @returns Debug representation showing schema, state, and changes
     */
    toJSON(): object {
        return {
            schema: this.schema.schema_name,
            isNew: this.isNew(),
            current: this._current,
            original: this._original,
            changes: this.getChanges(),
            changedFields: this.getChangedFields()
        };
    }
}
