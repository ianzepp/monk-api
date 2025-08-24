import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';

describe('FTP Store Endpoint - Integration Tests', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;

  beforeAll(async () => {
    tenantManager = await createTestTenant();
    testContext = await createTestContext(tenantManager.tenant!, 'root');

    // Create test schemas
    const accountYaml = await readFile('test/schemas/account.yaml', 'utf-8');
    const contactYaml = await readFile('test/schemas/contact.yaml', 'utf-8');
    
    await testContext.metabase.createOne('account', accountYaml);
    await testContext.metabase.createOne('contact', contactYaml);
  });

  afterAll(async () => {
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  describe('New Record Creation', () => {
    test('should create new account record', async () => {
      const newAccount = {
        id: 'account-store-001',
        name: 'Store Test User',
        email: 'store.test@example.com',
        username: 'storetest',
        account_type: 'personal',
        balance: 100.00,
        is_active: true,
        is_verified: false
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-store-001.json',
          content: newAccount,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.data.operation).toBe('create');
      expect(result.data.result.created).toBe(true);
      expect(result.data.result.record_id).toBe('account-store-001');
      
      // Verify record was actually created
      const createdRecord = await testContext.database.selectOne('account', {
        where: { id: 'account-store-001' }
      });
      
      expect(createdRecord).toBeDefined();
      expect(createdRecord.name).toBe('Store Test User');
      expect(createdRecord.email).toBe('store.test@example.com');
    });

    test('should create contact record with nested objects', async () => {
      const newContact = {
        id: 'contact-store-001',
        first_name: 'Store',
        last_name: 'Test',
        email: 'store.test@contact.com',
        company: 'Test Corp',
        job_title: 'Test Engineer',
        contact_type: 'customer',
        priority: 'normal',
        is_active: true,
        address: {
          street: '456 Test Ave',
          city: 'Test City',
          state: 'TS',
          postal_code: '12345',
          country: 'US'
        },
        tags: ['test', 'automated', 'new']
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/contact/contact-store-001.json',
          content: newContact,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.data.operation).toBe('create');
      expect(result.data.result.record_id).toBe('contact-store-001');
      
      // Verify nested objects were stored correctly
      const createdRecord = await testContext.database.selectOne('contact', {
        where: { id: 'contact-store-001' }
      });
      
      expect(createdRecord.address.street).toBe('456 Test Ave');
      expect(createdRecord.tags).toEqual(['test', 'automated', 'new']);
    });

    test('should auto-generate ID when not provided', async () => {
      const newAccountNoId = {
        name: 'Auto ID Test',
        email: 'auto.id@example.com',
        username: 'autoid',
        account_type: 'trial'
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/auto-generated.json',
          content: newAccountNoId,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.data.operation).toBe('create');
      expect(result.data.result.record_id).toBeDefined();
      expect(result.data.result.record_id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    test('should validate against schema', async () => {
      const invalidAccount = {
        id: 'invalid-account',
        name: 'X', // Too short (minLength: 2)
        email: 'invalid-email', // Invalid email format
        username: 'a', // Too short (pattern requires 3-30 chars)
        account_type: 'invalid_type' // Not in enum
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/invalid-account.json',
          content: invalidAccount,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });
  });

  describe('Field-Level Updates', () => {
    test('should update individual string field', async () => {
      // First create a record to update
      const baseAccount = {
        id: 'account-update-001',
        name: 'Update Test',
        email: 'update.test@example.com',
        username: 'updatetest',
        account_type: 'personal'
      };
      
      await testContext.database.createOne('account', baseAccount);

      // Update email field
      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-update-001/email',
          content: 'updated.email@example.com',
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.data.operation).toBe('update');
      expect(result.data.result.updated).toBe(true);
      
      // Verify field was updated
      const updatedRecord = await testContext.database.selectOne('account', {
        where: { id: 'account-update-001' }
      });
      
      expect(updatedRecord.email).toBe('updated.email@example.com');
      expect(updatedRecord.name).toBe('Update Test'); // Other fields unchanged
    });

    test('should update numeric field', async () => {
      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-update-001/balance',
          content: 500.75,
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.data.operation).toBe('update');
      
      // Verify numeric field was updated
      const updatedRecord = await testContext.database.selectOne('account', {
        where: { id: 'account-update-001' }
      });
      
      expect(updatedRecord.balance).toBe(500.75);
    });

    test('should update boolean field', async () => {
      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-update-001/is_verified',
          content: true,
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      
      const updatedRecord = await testContext.database.selectOne('account', {
        where: { id: 'account-update-001' }
      });
      
      expect(updatedRecord.is_verified).toBe(true);
    });

    test('should update object field', async () => {
      const newPreferences = {
        notifications: false,
        theme: 'light',
        language: 'es'
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-update-001/preferences',
          content: newPreferences,
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      
      const updatedRecord = await testContext.database.selectOne('account', {
        where: { id: 'account-update-001' }
      });
      
      expect(updatedRecord.preferences).toEqual(newPreferences);
    });
  });

  describe('Overwrite Protection', () => {
    test('should prevent overwriting existing record when overwrite=false', async () => {
      // Try to create record with same ID as existing record
      const duplicateAccount = {
        id: 'account-update-001', // This ID already exists
        name: 'Duplicate Test',
        email: 'duplicate@example.com',
        username: 'duplicate',
        account_type: 'business'
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-update-001.json',
          content: duplicateAccount,
          ftp_options: {
            binary_mode: false,
            overwrite: false, // Should prevent overwrite
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should allow overwriting when overwrite=true', async () => {
      const replacementAccount = {
        id: 'account-overwrite-001',
        name: 'Original Name',
        email: 'original@example.com',
        username: 'original',
        account_type: 'trial'
      };

      // First create the record
      await testContext.database.createOne('account', replacementAccount);

      // Then overwrite it
      const newContent = {
        id: 'account-overwrite-001',
        name: 'Overwritten Name',
        email: 'overwritten@example.com',
        username: 'overwritten',
        account_type: 'premium'
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-overwrite-001.json',
          content: newContent,
          ftp_options: {
            binary_mode: false,
            overwrite: true, // Allow overwrite
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.data.operation).toBe('create'); // Still shows as create in current implementation
      
      // Verify the record was overwritten
      const updatedRecord = await testContext.database.selectOne('account', {
        where: { id: 'account-overwrite-001' }
      });
      
      expect(updatedRecord.name).toBe('Overwritten Name');
      expect(updatedRecord.account_type).toBe('premium');
    });
  });

  describe('Content Format Handling', () => {
    test('should parse JSON string content', async () => {
      const jsonString = JSON.stringify({
        id: 'account-json-001',
        name: 'JSON Parse Test',
        email: 'json.test@example.com',
        username: 'jsontest',
        account_type: 'business',
        metadata: {
          source: 'json_string',
          parsed: true
        }
      });

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/account-json-001.json',
          content: jsonString,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          },
          metadata: {
            content_type: 'application/json'
          }
        })
      });

      expect(response.status).toBe(200);
      
      // Verify JSON was parsed correctly
      const createdRecord = await testContext.database.selectOne('account', {
        where: { id: 'account-json-001' }
      });
      
      expect(createdRecord.metadata.source).toBe('json_string');
      expect(createdRecord.metadata.parsed).toBe(true);
    });

    test('should handle string content as plain text field update', async () => {
      // First create a record
      const baseContact = {
        id: 'contact-text-001',
        first_name: 'Text',
        last_name: 'Test',
        email: 'text.test@example.com',
        contact_type: 'customer'
      };
      
      await testContext.database.createOne('contact', baseContact);

      // Update company field with plain text
      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/contact/contact-text-001/company',
          content: 'Updated Company Name',
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      expect(result.data.operation).toBe('update');
      
      // Verify field was updated
      const updatedRecord = await testContext.database.selectOne('contact', {
        where: { id: 'contact-text-001' }
      });
      
      expect(updatedRecord.company).toBe('Updated Company Name');
    });
  });

  describe('Schema Validation Integration', () => {
    test('should enforce required fields', async () => {
      const incompleteAccount = {
        id: 'incomplete-account',
        name: 'Incomplete Test'
        // Missing required email, username, account_type
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/incomplete-account.json',
          content: incompleteAccount,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should enforce field constraints', async () => {
      const invalidAccount = {
        id: 'constraint-test',
        name: 'X', // Too short (minLength: 2)
        email: 'invalid-email-format',
        username: 'toolongusernamethatexceedsmaximum', // Too long
        account_type: 'personal',
        balance: -100 // Negative (minimum: 0)
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/constraint-test.json',
          content: invalidAccount,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should enforce enum constraints', async () => {
      const invalidContact = {
        id: 'enum-test',
        first_name: 'Enum',
        last_name: 'Test',
        email: 'enum.test@example.com',
        contact_type: 'invalid_contact_type', // Not in enum
        priority: 'invalid_priority' // Not in enum
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/contact/enum-test.json',
          content: invalidContact,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent record for field update', async () => {
      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/nonexistent-record/email',
          content: 'test@example.com',
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should handle invalid field name for update', async () => {
      // Create record first
      const testAccount = {
        id: 'field-test-001',
        name: 'Field Test',
        email: 'field.test@example.com',
        username: 'fieldtest',
        account_type: 'personal'
      };
      
      await testContext.database.createOne('account', testAccount);

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/field-test-001/nonexistent_field',
          content: 'some value',
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });

    test('should handle invalid path formats', async () => {
      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/invalid/path/format',
          content: { test: 'data' },
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(500);
    });
  });

  describe('FTP Metadata and Response Format', () => {
    test('should provide accurate response metadata', async () => {
      const testAccount = {
        id: 'metadata-test-001',
        name: 'Metadata Test',
        email: 'metadata@example.com',
        username: 'metatest',
        account_type: 'business',
        balance: 1000.00
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/metadata-test-001.json',
          content: testAccount,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      // Verify response structure
      expect(result.data.result.path).toBe('/data/account/metadata-test-001.json');
      expect(result.data.result.size).toBeGreaterThan(0);
      expect(result.data.ftp_metadata.modified_time).toMatch(/^\d{14}$/);
      expect(result.data.ftp_metadata.permissions).toMatch(/^[r-][w-][x-]$/);
    });

    test('should calculate accurate content sizes', async () => {
      const largeContent = {
        id: 'size-test-001',
        name: 'Size Test',
        email: 'size.test@example.com',
        username: 'sizetest',
        account_type: 'personal',
        metadata: {
          large_text: 'x'.repeat(1000),
          large_array: Array.from({ length: 50 }, (_, i) => `item-${i}`)
        }
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/size-test-001.json',
          content: largeContent,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      
      // Size should reflect the actual JSON content size
      expect(result.data.result.size).toBeGreaterThan(1000);
    });
  });

  describe('Observer Integration', () => {
    test('should trigger observer pipeline during creation', async () => {
      const observedAccount = {
        id: 'observer-test-001',
        name: 'Observer Test',
        email: 'observer@example.com',
        username: 'observer',
        account_type: 'business'
      };

      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/observer-test-001.json',
          content: observedAccount,
          ftp_options: {
            binary_mode: false,
            overwrite: false,
            append_mode: false,
            create_path: true,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      
      // Verify record was created through observer pipeline
      const createdRecord = await testContext.database.selectOne('account', {
        where: { id: 'observer-test-001' }
      });
      
      expect(createdRecord).toBeDefined();
      expect(createdRecord.created_at).toBeDefined(); // Added by observers
      expect(createdRecord.updated_at).toBeDefined(); // Added by observers
    });

    test('should trigger observer pipeline during field updates', async () => {
      // Create base record
      const baseRecord = {
        id: 'observer-update-001',
        name: 'Observer Update Test',
        email: 'observer.update@example.com',
        username: 'obsupdate',
        account_type: 'personal'
      };
      
      await testContext.database.createOne('account', baseRecord);
      
      // Get initial updated_at
      const initialRecord = await testContext.database.selectOne('account', {
        where: { id: 'observer-update-001' }
      });
      
      const initialUpdatedAt = initialRecord.updated_at;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update field through FTP store
      const response = await fetch('http://localhost:9001/ftp/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.jwtToken}`
        },
        body: JSON.stringify({
          path: '/data/account/observer-update-001/balance',
          content: 500.00,
          ftp_options: {
            binary_mode: false,
            overwrite: true,
            append_mode: false,
            create_path: false,
            atomic: true
          }
        })
      });

      expect(response.status).toBe(200);
      
      // Verify observer pipeline updated the updated_at timestamp
      const updatedRecord = await testContext.database.selectOne('account', {
        where: { id: 'observer-update-001' }
      });
      
      expect(updatedRecord.updated_at).not.toBe(initialUpdatedAt);
      expect(updatedRecord.balance).toBe(500.00);
    });
  });
});