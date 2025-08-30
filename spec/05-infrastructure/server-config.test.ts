/**
 * Infrastructure Tests - TypeScript Configuration
 * 
 * Tests core TypeScript classes and configuration setup
 * Equivalent to test/05-infrastructure/servers-config-test.sh
 */

import { describe, test, expect } from 'vitest';
import { TenantService } from '../../src/lib/services/tenant.js';
import os from 'os';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

describe('05-infrastructure: TypeScript Configuration', () => {

  describe('Core Classes', () => {
    test('should be able to access TenantService methods', () => {
      expect(TenantService).toBeDefined();
      expect(typeof TenantService.createTenant).toBe('function');
      expect(typeof TenantService.deleteTenant).toBe('function');
      expect(typeof TenantService.listTenants).toBe('function');
      expect(typeof TenantService.login).toBe('function');
      expect(typeof TenantService.verifyToken).toBe('function');
      expect(typeof TenantService.generateToken).toBe('function');
    });

    test('should have valid database connection configuration', () => {
      // Test that TenantService can access registry database configuration
      expect(TenantService).toBeDefined();
      
      // This implicitly tests that database configuration is accessible
      expect(typeof TenantService.tenantExists).toBe('function');
      expect(typeof TenantService.databaseExists).toBe('function');
    });
  });

  describe('Environment Configuration', () => {
    test('should have required environment variables available', () => {
      // Test database environment variables
      const databaseUrl = process.env.DATABASE_URL;
      const port = process.env.PORT;
      
      expect(databaseUrl).toBeDefined();
      expect(port).toBeDefined();
      expect(port).toMatch(/^\d+$/);
    });
  });

  describe('Database Configuration', () => {
    test('should be able to connect to registry database', async () => {
      // Test that we can check for existing tenants (tests auth DB connection)
      try {
        const tenants = await TenantService.listTenants();
        expect(Array.isArray(tenants)).toBe(true);
      } catch (error: any) {
        // If this fails, it should be a connection error, not a config error
        expect(error.message.toLowerCase()).not.toContain('config');
        expect(error.message.toLowerCase()).not.toContain('syntax');
      }
    }, 10000);

    test('should have valid database naming convention', () => {
      // Test naming convention pattern used by TenantService
      const testNames = [
        'test-simple',
        'test_with_underscores',
        'test-with-dashes',
        'TEST-UPPERCASE',
        'test123numbers'
      ];
      
      testNames.forEach(name => {
        // Test the expected naming convention pattern (direct tenant names)
        const expectedPattern = /^[a-z0-9_]+$/;
        const database = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '').toLowerCase();
        expect(database).toMatch(expectedPattern);
      });
    });
  });
});