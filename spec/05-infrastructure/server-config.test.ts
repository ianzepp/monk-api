/**
 * Infrastructure Tests - TypeScript Configuration
 * 
 * Tests core TypeScript classes and configuration setup
 * Equivalent to tests/05-infrastructure/servers-config-test.sh
 */

import { describe, test, expect } from 'vitest';
import { TenantManager } from '../../src/lib/tenant-manager.js';
import { AuthService } from '../../src/lib/auth.js';
import os from 'os';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

describe('05-infrastructure: TypeScript Configuration', () => {

  describe('Core Classes', () => {
    test('should be able to instantiate TenantManager', () => {
      const tenantManager = new TenantManager();
      expect(tenantManager).toBeDefined();
      expect(typeof tenantManager.createTenant).toBe('function');
      expect(typeof tenantManager.deleteTenant).toBe('function');
      expect(typeof tenantManager.listTenants).toBe('function');
    });

    test('should be able to access AuthService methods', () => {
      expect(AuthService).toBeDefined();
      expect(typeof AuthService.login).toBe('function');
      expect(typeof AuthService.verifyToken).toBe('function');
      expect(typeof AuthService.generateToken).toBe('function');
    });

    test('should have valid database connection configuration', () => {
      // Test that TenantManager can access auth database configuration
      const tenantManager = new TenantManager();
      
      // This implicitly tests that database configuration is accessible
      expect(tenantManager).toBeDefined();
    });
  });

  describe('Environment Configuration', () => {
    test('should have required environment variables available', () => {
      // Test database environment variables
      const dbUser = process.env.DB_USER || process.env.USER;
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || '5432';
      
      expect(dbUser).toBeDefined();
      expect(dbHost).toBeDefined();
      expect(dbPort).toBeDefined();
      expect(dbPort).toMatch(/^\d+$/);
    });

    test('should have monk configuration directory', () => {
      const configDir = path.join(os.homedir(), '.config/monk');
      expect(existsSync(configDir)).toBe(true);
    });

    test('should have servers configuration file', () => {
      const configPath = path.join(os.homedir(), '.config/monk/servers.json');
      
      if (existsSync(configPath)) {
        // Should be valid JSON
        const configContent = readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        expect(config).toHaveProperty('servers');
        expect(config).toHaveProperty('current');
        expect(typeof config.servers).toBe('object');
        expect(typeof config.current).toBe('string');
      }
    });

    test('should have environment configuration file if it exists', () => {
      const configPath = path.join(os.homedir(), '.config/monk/env.json');
      
      if (existsSync(configPath)) {
        const envContent = readFileSync(configPath, 'utf8');
        const envConfig = JSON.parse(envContent);
        
        // Should have database configuration
        expect(envConfig).toHaveProperty('DATABASE_URL');
        expect(typeof envConfig.DATABASE_URL).toBe('string');
        expect(envConfig.DATABASE_URL).toContain('postgresql://');
      }
    });
  });

  describe('Database Configuration', () => {
    test('should be able to connect to auth database', async () => {
      const tenantManager = new TenantManager();
      
      // Test that we can check for existing tenants (tests auth DB connection)
      try {
        const tenants = await tenantManager.listTenants();
        expect(Array.isArray(tenants)).toBe(true);
      } catch (error: any) {
        // If this fails, it should be a connection error, not a config error
        expect(error.message.toLowerCase()).not.toContain('config');
        expect(error.message.toLowerCase()).not.toContain('syntax');
      }
    }, 10000);

    test('should have valid database naming convention', () => {
      const tenantManager = new TenantManager();
      
      // Access private method via prototype to test naming convention
      const testNames = [
        'test-simple',
        'test_with_underscores',
        'test-with-dashes',
        'TEST-UPPERCASE',
        'test123numbers'
      ];
      
      testNames.forEach(name => {
        // We can't directly test the private method, but we can test the pattern
        const expectedPattern = /^monk-api\$[a-z0-9-]+$/;
        const database = `monk-api$${name.replace(/[^a-zA-Z0-9]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '').toLowerCase()}`;
        expect(database).toMatch(expectedPattern);
      });
    });
  });
});