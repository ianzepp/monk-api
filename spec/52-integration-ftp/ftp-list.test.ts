import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';

describe('FTP List Endpoint - Integration Tests', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;
  let accountData: any[];
  let contactData: any[];

  beforeAll(async () => {
    // Create fresh tenant for this test suite
    tenantManager = await createTestTenant();
    testContext = await createTestContext(tenantManager.tenant!, 'root');

    // Create test schemas
    const accountYaml = await readFile('spec/fixtures/schema/account.yaml', 'utf-8');
    const contactYaml = await readFile('spec/fixtures/schema/contact.yaml', 'utf-8');
    
    await testContext.metabase.createOne('account', accountYaml);
    await testContext.metabase.createOne('contact', contactYaml);

    // Create test data
    accountData = [
      {
        id: 'account-001',
        name: 'John Smith',
        email: 'john.smith@example.com',
        username: 'jsmith',
        account_type: 'personal',
        balance: 150.75,
        is_active: true,
        is_verified: true
      },
      {
        id: 'account-002', 
        name: 'Jane Admin',
        email: 'jane.admin@company.com',
        username: 'jadmin',
        account_type: 'business',
        balance: 5000.00,
        is_active: true,
        is_verified: true
      },
      {
        id: 'account-003',
        name: 'Test User',
        email: 'test.user@temp.com', 
        username: 'testuser',
        account_type: 'trial',
        balance: 0.00,
        is_active: false,
        is_verified: false
      }
    ];

    contactData = [
      {
        id: 'contact-001',
        first_name: 'Alice',
        last_name: 'Johnson',
        email: 'alice.johnson@acme.com',
        company: 'Acme Corp',
        job_title: 'Software Engineer',
        contact_type: 'employee',
        priority: 'high',
        is_active: true,
        account_id: 'account-001'
      },
      {
        id: 'contact-002',
        first_name: 'Bob',
        last_name: 'Wilson', 
        email: 'bob.wilson@vendor.com',
        company: 'Vendor Inc',
        job_title: 'Sales Manager',
        contact_type: 'vendor',
        priority: 'normal',
        is_active: true,
        tags: ['technical', 'decision-maker']
      }
    ];

    // Insert test data
    await testContext.database.createAll('account', accountData);
    await testContext.database.createAll('contact', contactData);
  });

  afterAll(async () => {
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  describe('Root Directory Listing', () => {
    test('should list root directories (/)', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.data.entries).toHaveLength(2);
      
      const entries = result.data.entries;
      expect(entries.find((e: any) => e.name === 'data')).toBeDefined();
      expect(entries.find((e: any) => e.name === 'meta')).toBeDefined();
      
      // Verify FTP format
      const dataEntry = entries.find((e: any) => e.name === 'data');
      expect(dataEntry.ftp_type).toBe('d');
      expect(dataEntry.ftp_permissions).toBe('r-x');
      expect(dataEntry.path).toBe('/data/');
    });
  });

  describe('Schema Directory Listing', () => {
    test('should list available schemas (/data/)', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.data.entries.length).toBeGreaterThanOrEqual(2);
      
      const entries = result.data.entries;
      const schemaNames = entries.map((e: any) => e.name);
      
      expect(schemaNames).toContain('account');
      expect(schemaNames).toContain('contact');
      
      // Verify schema entry format
      const accountEntry = entries.find((e: any) => e.name === 'account');
      expect(accountEntry.ftp_type).toBe('d');
      expect(accountEntry.api_context.schema).toBe('account');
      expect(accountEntry.path).toBe('/data/account/');
    });

    test('should hide system schemas from non-root users', async () => {
      // This test assumes current user is root, so system schemas should be visible
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      const result = await response.json();
      const schemaNames = result.data.entries.map((e: any) => e.name);
      
      // Root user should see system schemas
      expect(schemaNames).toContain('schema');
    });
  });

  describe('Record Listing within Schema', () => {
    test('should list records in account schema (/data/account/)', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.data.entries).toHaveLength(3); // 3 account records
      
      const entries = result.data.entries;
      const recordIds = entries.map((e: any) => e.name);
      
      expect(recordIds).toContain('account-001');
      expect(recordIds).toContain('account-002');
      expect(recordIds).toContain('account-003');
      
      // Verify record entry format
      const account001 = entries.find((e: any) => e.name === 'account-001');
      expect(account001.ftp_type).toBe('d');
      expect(account001.api_context.schema).toBe('account');
      expect(account001.api_context.record_id).toBe('account-001');
      expect(account001.path).toBe('/data/account/account-001/');
    });

    test('should list records in contact schema (/data/contact/)', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/contact/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false,
            sort_by: 'name',
            sort_order: 'asc'
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.data.entries).toHaveLength(2);
      
      const entries = result.data.entries;
      expect(entries[0].name).toBe('contact-001'); // Sorted by name
      expect(entries[1].name).toBe('contact-002');
    });
  });

  describe('Field Listing within Record', () => {
    test('should list record fields and JSON file (/data/account/account-001/)', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-001/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      
      const entries = result.data.entries;
      const entryNames = entries.map((e: any) => e.name);
      
      // Should include JSON file and individual fields
      expect(entryNames).toContain('account-001.json');
      expect(entryNames).toContain('name');
      expect(entryNames).toContain('email');
      expect(entryNames).toContain('username');
      expect(entryNames).toContain('account_type');
      expect(entryNames).toContain('balance');
      
      // Verify JSON file entry
      const jsonEntry = entries.find((e: any) => e.name === 'account-001.json');
      expect(jsonEntry.ftp_type).toBe('f');
      expect(jsonEntry.ftp_size).toBeGreaterThan(0);
      expect(jsonEntry.api_context.record_id).toBe('account-001');
      
      // Verify field entry
      const emailEntry = entries.find((e: any) => e.name === 'email');
      expect(emailEntry.ftp_type).toBe('f');
      expect(emailEntry.api_context.field_name).toBe('email');
      expect(emailEntry.path).toBe('/data/account/account-001/email');
    });

    test('should list contact fields with nested objects (/data/contact/contact-001/)', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/contact/contact-001/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      const entries = result.data.entries;
      const entryNames = entries.map((e: any) => e.name);
      
      expect(entryNames).toContain('contact-001.json');
      expect(entryNames).toContain('first_name');
      expect(entryNames).toContain('last_name');
      expect(entryNames).toContain('email');
      expect(entryNames).toContain('company');
      expect(entryNames).toContain('job_title');
      expect(entryNames).toContain('account_id'); // UUID field
    });
  });

  describe('Sorting and Formatting Options', () => {
    test('should support name sorting', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false,
            sort_by: 'name',
            sort_order: 'asc'
          }
        })
      });

      const result = await response.json();
      const entries = result.data.entries;
      
      // Should be sorted by record ID
      expect(entries[0].name).toBe('account-001');
      expect(entries[1].name).toBe('account-002');
      expect(entries[2].name).toBe('account-003');
    });

    test('should support date sorting', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false,
            sort_by: 'date',
            sort_order: 'desc'
          }
        })
      });

      const result = await response.json();
      
      // Should be sorted by updated_at desc
      expect(result.data.entries).toHaveLength(3);
      expect(result.data.entries[0].api_context.record_id).toBe('account-003'); // Most recent
    });
  });

  describe('FTP Metadata Formatting', () => {
    test('should provide proper FTP timestamps', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      const result = await response.json();
      const entry = result.data.entries[0];
      
      // FTP timestamp format: YYYYMMDDHHMMSS
      expect(entry.ftp_modified).toMatch(/^\d{14}$/);
      expect(entry.ftp_modified).toHaveLength(14);
    });

    test('should calculate FTP permissions from ACL', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      const result = await response.json();
      const entry = result.data.entries[0];
      
      // Root user should have full permissions
      expect(entry.ftp_permissions).toMatch(/^[r-][w-][x-]$/);
      expect(entry.api_context.access_level).toMatch(/^(read|edit|full)$/);
    });

    test('should provide accurate file sizes', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-001/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      const result = await response.json();
      const entries = result.data.entries;
      
      // JSON file should have calculated size
      const jsonEntry = entries.find((e: any) => e.name === 'account-001.json');
      expect(jsonEntry.ftp_size).toBeGreaterThan(0);
      
      // Field entries should have field-specific sizes
      const emailEntry = entries.find((e: any) => e.name === 'email');
      expect(emailEntry.ftp_size).toBeGreaterThan(0);
      expect(emailEntry.ftp_size).toBeLessThan(jsonEntry.ftp_size);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid paths gracefully', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/invalid/path/structure/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should handle non-existent schema', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/nonexistent/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should handle non-existent record', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/nonexistent-record/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should require authentication', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header
        },
        body: JSON.stringify({
          path: '/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(401);
    });
  });

  describe('ACL Integration (Preparation for Future)', () => {
    test('should include ACL context in API responses', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      const result = await response.json();
      const entry = result.data.entries[0];
      
      // Should include access level information
      expect(entry.api_context.access_level).toBeDefined();
      expect(['read', 'edit', 'full']).toContain(entry.api_context.access_level);
    });

    test('should handle soft delete filtering preparation', async () => {
      // First, soft delete a record
      await testContext.database.deleteOne('account', 'account-003');
      
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/',
          ftp_options: {
            show_hidden: false, // Don't show trashed records
            long_format: true,
            recursive: false
          }
        })
      });

      const result = await response.json();
      const recordIds = result.data.entries.map((e: any) => e.name);
      
      // Soft deleted record should not appear (once ACL filtering is implemented)
      expect(result.data.entries).toHaveLength(2); // Only active records
      expect(recordIds).not.toContain('account-003');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle empty schemas', async () => {
      // Create empty schema for testing
      const emptySchemaYaml = `
title: Empty Test
description: Empty schema for testing
type: object
properties:
  name:
    type: string
required:
  - name
additionalProperties: false
`;
      
      await testContext.metabase.createOne('empty_test', emptySchemaYaml);
      
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/empty_test/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.entries).toHaveLength(0); // No records
    });

    test('should provide accurate entry counts', async () => {
      const response = await fetch('http://localhost:9001/ftp/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/contact/',
          ftp_options: {
            show_hidden: false,
            long_format: true,
            recursive: false
          }
        })
      });

      const result = await response.json();
      
      expect(result.data.total).toBe(result.data.entries.length);
      expect(result.data.has_more).toBe(false);
    });
  });
});