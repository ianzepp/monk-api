/**
 * JsonSchemaValidator Unit Tests
 * 
 * Tests JSON Schema validation logic using mock Schema objects.
 * Validates that schema validation errors are properly converted to observer errors.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import JsonSchemaValidator from '@src/observers/all/1/json-schema-validator.js';
import { ValidationError } from '@lib/observers/errors.js';
import { ObserverRing } from '@lib/observers/types.js';

describe('JsonSchemaValidator', () => {
  let validator: JsonSchemaValidator;
  let mockContext: any;

  beforeEach(() => {
    validator = new JsonSchemaValidator();
    
    // Create mock context with System and Schema objects
    mockContext = {
      system: {
        info: vi.fn(),
        warn: vi.fn()
      },
      operation: 'create',
      schemaName: 'test_schema',
      schema: {
        validateOrThrow: vi.fn()
      },
      data: [
        { name: 'Test User', email: 'test@example.com' }
      ],
      metadata: new Map()
    };
  });

  describe('configuration', () => {
    test('should be configured for validation ring', () => {
      expect(validator.ring).toBe(ObserverRing.InputValidation);
      expect(validator.operations).toEqual(['create', 'update']);
    });
  });

  describe('validation success', () => {
    test('should validate all records successfully', async () => {
      mockContext.schema.validateOrThrow.mockImplementation(() => {
        // Successful validation - no throw
      });
      
      await validator.execute(mockContext);
      
      // Should validate each record
      expect(mockContext.schema.validateOrThrow).toHaveBeenCalledTimes(1);
      expect(mockContext.schema.validateOrThrow).toHaveBeenCalledWith({
        name: 'Test User',
        email: 'test@example.com'
      });
      
      // Should set success metadata
      expect(mockContext.metadata.get('json_schema_validation')).toBe('passed');
      expect(mockContext.metadata.get('validated_record_count')).toBe(1);
      
      // Should log success
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'JSON Schema validation completed',
        expect.objectContaining({
          schemaName: 'test_schema',
          operation: 'create',
          recordCount: 1,
          validatedCount: 1,
          errorCount: 0
        })
      );
    });

    test('should handle multiple records', async () => {
      mockContext.data = [
        { name: 'User 1', email: 'user1@example.com' },
        { name: 'User 2', email: 'user2@example.com' },
        { name: 'User 3', email: 'user3@example.com' }
      ];
      mockContext.schema.validateOrThrow.mockImplementation(() => {
        // All records valid
      });
      
      await validator.execute(mockContext);
      
      // Should validate all records
      expect(mockContext.schema.validateOrThrow).toHaveBeenCalledTimes(3);
      expect(mockContext.metadata.get('validated_record_count')).toBe(3);
      
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'JSON Schema validation completed',
        expect.objectContaining({
          recordCount: 3,
          validatedCount: 3,
          errorCount: 0
        })
      );
    });
  });

  describe('validation failures', () => {
    test('should throw ValidationError for invalid records', async () => {
      const schemaError = new Error('Required field "email" is missing');
      mockContext.schema.validateOrThrow.mockImplementation(() => {
        throw schemaError;
      });
      
      await expect(validator.execute(mockContext)).rejects.toThrow(ValidationError);
      await expect(validator.execute(mockContext)).rejects.toThrow('Schema validation failed');
      await expect(validator.execute(mockContext)).rejects.toThrow('Required field "email" is missing');
    });

    test('should include schema name in validation error', async () => {
      mockContext.schemaName = 'account';
      mockContext.schema.validateOrThrow.mockImplementation(() => {
        throw new Error('Invalid account data');
      });
      
      try {
        await validator.execute(mockContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('Schema validation failed for account');
        expect(error.message).toContain('Invalid account data');
        expect(error.code).toBe('JSON_SCHEMA_VALIDATION_FAILED');
      }
    });

    test('should handle non-Error validation failures', async () => {
      mockContext.schema.validateOrThrow.mockImplementation(() => {
        throw 'String error message';  // Non-Error throw
      });
      
      try {
        await validator.execute(mockContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('String error message');
      }
    });
  });

  describe('operation handling', () => {
    test('should handle create operations', async () => {
      mockContext.operation = 'create';
      mockContext.schema.validateOrThrow.mockImplementation(() => {});
      
      await validator.execute(mockContext);
      
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'JSON Schema validation completed',
        expect.objectContaining({ operation: 'create' })
      );
    });

    test('should handle update operations', async () => {
      mockContext.operation = 'update';
      mockContext.schema.validateOrThrow.mockImplementation(() => {});
      
      await validator.execute(mockContext);
      
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'JSON Schema validation completed',
        expect.objectContaining({ operation: 'update' })
      );
    });
  });

  describe('edge cases', () => {
    test('should handle empty data array', async () => {
      mockContext.data = [];
      
      await validator.execute(mockContext);
      
      expect(mockContext.schema.validateOrThrow).not.toHaveBeenCalled();
      expect(mockContext.metadata.get('validated_record_count')).toBe(0);
      
      expect(mockContext.system.info).toHaveBeenCalledWith(
        'JSON Schema validation completed',
        expect.objectContaining({
          recordCount: 0,
          validatedCount: 0,
          errorCount: 0
        })
      );
    });
  });
});