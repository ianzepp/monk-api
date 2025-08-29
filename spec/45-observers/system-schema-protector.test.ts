/**
 * SystemSchemaProtector Unit Tests
 * 
 * Tests system schema protection logic without requiring database setup.
 * Uses mock Schema objects to validate protection logic.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import SystemSchemaProtector from '@src/observers/all/0/system-schema-protector.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import { ObserverRing } from '@src/lib/observers/types.js';

describe('SystemSchemaProtector', () => {
  let protector: SystemSchemaProtector;
  let mockContext: any;

  beforeEach(() => {
    protector = new SystemSchemaProtector();
    
    // Create mock context with System and Schema objects
    mockContext = {
      system: {
        info: vi.fn(),
        warn: vi.fn()
      },
      operation: 'create',
      schemaName: 'user_schema',
      schema: {
        isSystemSchema: vi.fn()
      },
      data: [{ name: 'test' }],
      metadata: new Map()
    };
  });

  describe('configuration', () => {
    test('should be configured for validation ring', () => {
      expect(protector.ring).toBe(ObserverRing.Validation);
      expect(protector.operations).toEqual(['create', 'update', 'delete']);
    });
  });

  describe('system schema protection', () => {
    test('should allow operations on user schemas', async () => {
      mockContext.schema.isSystemSchema.mockReturnValue(false);
      
      await protector.execute(mockContext);
      
      // Should complete without throwing
      expect(mockContext.metadata.get('system_schema_check')).toBe('passed');
      expect(mockContext.metadata.get('schema_type')).toBe('user_schema');
      
      // Should log success
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'System schema protection check passed',
        expect.objectContaining({
          schemaName: 'user_schema',
          operation: 'create',
          schemaType: 'user_schema'
        })
      );
    });

    test('should block operations on system schemas', async () => {
      mockContext.schema.isSystemSchema.mockReturnValue(true);
      mockContext.schemaName = 'schema';
      
      await expect(protector.execute(mockContext)).rejects.toThrow(ValidationError);
      await expect(protector.execute(mockContext)).rejects.toThrow('system schema');
      await expect(protector.execute(mockContext)).rejects.toThrow('use meta API');
    });

    test('should include schema name in error message', async () => {
      mockContext.schema.isSystemSchema.mockReturnValue(true);
      mockContext.schemaName = 'users';
      mockContext.operation = 'delete';
      
      try {
        await protector.execute(mockContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('delete records in system schema "users"');
        expect(error.code).toBe('SYSTEM_SCHEMA_PROTECTION');
      }
    });
  });

  describe('operation handling', () => {
    test('should handle create operations', async () => {
      mockContext.operation = 'create';
      mockContext.schema.isSystemSchema.mockReturnValue(false);
      
      await protector.execute(mockContext);
      
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'System schema protection check passed',
        expect.objectContaining({ operation: 'create' })
      );
    });

    test('should handle update operations', async () => {
      mockContext.operation = 'update';
      mockContext.schema.isSystemSchema.mockReturnValue(false);
      
      await protector.execute(mockContext);
      
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'System schema protection check passed',
        expect.objectContaining({ operation: 'update' })
      );
    });

    test('should handle delete operations', async () => {
      mockContext.operation = 'delete';
      mockContext.schema.isSystemSchema.mockReturnValue(false);
      
      await protector.execute(mockContext);
      
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'System schema protection check passed',
        expect.objectContaining({ operation: 'delete' })
      );
    });
  });

  describe('metadata tracking', () => {
    test('should set audit metadata for successful operations', async () => {
      mockContext.schema.isSystemSchema.mockReturnValue(false);
      
      await protector.execute(mockContext);
      
      expect(mockContext.metadata.get('system_schema_check')).toBe('passed');
      expect(mockContext.metadata.get('schema_type')).toBe('user_schema');
    });

    test('should not set metadata for failed operations', async () => {
      mockContext.schema.isSystemSchema.mockReturnValue(true);
      
      try {
        await protector.execute(mockContext);
      } catch (error) {
        // Should not set metadata if validation fails
        expect(mockContext.metadata.get('system_schema_check')).toBeUndefined();
        expect(mockContext.metadata.get('schema_type')).toBeUndefined();
      }
    });
  });
});