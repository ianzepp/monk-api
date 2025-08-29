/**
 * Fixture System Phase 2 Tests
 * 
 * Tests the comprehensive fixture definition system and smart data generators
 * with realistic data generation and proper relationships.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FixtureManager } from '@src/lib/fixtures/fixture-manager.js';
import { TemplateDatabase } from '@src/lib/fixtures/template-database.js';
import { AccountGenerator } from '../fixtures/generators/account-generator.js';
import { ContactGenerator } from '../fixtures/generators/contact-generator.js';
import { createTestContextWithTemplate } from '@spec/helpers/test-tenant.js';

describe('Fixture System Phase 2', () => {
  
  // Clean up templates before and after tests
  beforeAll(async () => {
    try {
      await TemplateDatabase.dropTemplate('basic');
    } catch (error) {
      // Template might not exist - that's fine
    }
  });
  
  afterAll(async () => {
    try {
      await TemplateDatabase.dropTemplate('basic');
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('Data Generators', () => {
    
    test('AccountGenerator should generate realistic account data', () => {
      const generator = new AccountGenerator();
      const records = generator.generate(5, { 
        include_edge_cases: false,
        realistic_names: true 
      });
      
      expect(records).toHaveLength(5);
      
      // Validate structure
      records.forEach(record => {
        expect(record.id).toBeDefined();
        expect(typeof record.id).toBe('string');
        expect(record.name).toBeDefined();
        expect(record.email).toBeDefined();
        expect(record.username).toBeDefined();
        expect(record.account_type).toBeOneOf(['personal', 'business', 'trial', 'premium']);
        expect(typeof record.balance).toBe('number');
        expect(typeof record.is_active).toBe('boolean');
        expect(typeof record.is_verified).toBe('boolean');
        expect(record.created_at).toBeDefined();
      });
      
      // Validate realistic data
      const firstRecord = records[0];
      expect(firstRecord.email).toMatch(/^[^@]+@[^@]+\.[^@]+$/); // Valid email format
      expect(firstRecord.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/); // Realistic name format
    });
    
    test('AccountGenerator should include edge cases when requested', () => {
      const generator = new AccountGenerator();
      const records = generator.generate(2, { 
        include_edge_cases: true,
        realistic_names: true 
      });
      
      // Should have regular records + edge cases
      expect(records.length).toBeGreaterThan(2);
      
      // Find edge case records
      const nullEdgeCase = records.find(r => r.username === 'edgenull');
      const maxEdgeCase = records.find(r => r.balance === 999999.99);
      const specialCharsCase = records.find(r => r.name.includes('O\'Reilly'));
      
      expect(nullEdgeCase).toBeDefined();
      expect(maxEdgeCase).toBeDefined();
      expect(specialCharsCase).toBeDefined();
    });
    
    test('ContactGenerator should generate contacts with account relationships', () => {
      const accountGenerator = new AccountGenerator();
      const accounts = accountGenerator.generate(3, { realistic_names: true });
      
      const context = {
        schemaName: 'contact',
        allSchemas: {},
        existingData: { account: accounts },
        relationships: [],
        options: { link_to_accounts: true, realistic_names: true }
      };
      
      const contactGenerator = new ContactGenerator();
      const contacts = contactGenerator.generate(5, { 
        link_to_accounts: true,
        realistic_names: true 
      }, context);
      
      expect(contacts).toHaveLength(5);
      
      // Validate structure
      contacts.forEach(contact => {
        expect(contact.id).toBeDefined();
        expect(contact.first_name).toBeDefined();
        expect(contact.last_name).toBeDefined();
        expect(contact.email).toBeDefined();
        expect(contact.contact_type).toBeOneOf(['customer', 'prospect', 'partner', 'vendor']);
        expect(contact.status).toBeOneOf(['active', 'inactive', 'pending', 'qualified']);
      });
      
      // Some contacts should have account relationships
      const linkedContacts = contacts.filter(c => c.account_id);
      expect(linkedContacts.length).toBeGreaterThan(0);
      
      // Validate foreign key references
      linkedContacts.forEach(contact => {
        const referencedAccount = accounts.find(a => a.id === contact.account_id);
        expect(referencedAccount).toBeDefined();
      });
    });
    
    test('ContactGenerator should respect dependencies', () => {
      const contactGenerator = new ContactGenerator();
      const dependencies = contactGenerator.getDependencies();
      
      expect(dependencies).toEqual(['account']);
    });
    
  });
  
  describe('FixtureManager', () => {
    
    test('should load fixture definition', async () => {
      const fixture = await FixtureManager.loadFixtureDefinition('basic');
      
      expect(fixture.name).toBe('basic');
      expect(fixture.description).toContain('Basic fixture');
      expect(fixture.schemas).toHaveProperty('account');
      expect(fixture.schemas).toHaveProperty('contact');
      expect(fixture.data_generators).toHaveProperty('account');
      expect(fixture.data_generators).toHaveProperty('contact');
      expect(fixture.relationships).toHaveLength(1);
    });
    
    test('should build fixture data with relationships', async () => {
      const fixture = await FixtureManager.loadFixtureDefinition('basic');
      const fixtureData = await FixtureManager.buildFixtureData(fixture);
      
      // Validate structure
      expect(fixtureData.schemas).toHaveProperty('account');
      expect(fixtureData.schemas).toHaveProperty('contact');
      expect(fixtureData.data).toHaveProperty('account');
      expect(fixtureData.data).toHaveProperty('contact');
      
      // Validate data counts
      const accounts = fixtureData.data.account;
      const contacts = fixtureData.data.contact;
      
      expect(accounts.length).toBeGreaterThan(0);
      expect(contacts.length).toBeGreaterThan(0);
      expect(fixtureData.metadata.total_records).toBe(accounts.length + contacts.length);
      
      // Validate relationships
      const linkedContacts = contacts.filter((c: any) => c.account_id);
      expect(linkedContacts.length).toBeGreaterThan(0);
      
      // Ensure all foreign keys reference valid accounts
      linkedContacts.forEach((contact: any) => {
        const referencedAccount = accounts.find((a: any) => a.id === contact.account_id);
        expect(referencedAccount).toBeDefined();
      });
    }, 10000); // Increase timeout for fixture building
    
    test('should handle missing fixture definition', async () => {
      await expect(
        FixtureManager.loadFixtureDefinition('nonexistent')
      ).rejects.toThrow('Fixture definition not found');
    });
    
  });
  
  describe('Template Building Integration', () => {
    
    test('should build template from fixture definition', async () => {
      await TemplateDatabase.buildTemplateFromFixture('basic');
      
      // Verify template exists
      const templates = await TemplateDatabase.listTemplates();
      expect(templates).toContain('basic');
    }, 30000); // Increase timeout for template building
    
    test('should create test context with fixture-based template', async () => {
      // Ensure template exists
      await TemplateDatabase.buildTemplateFromFixture('basic');
      
      // Create test context from template
      const testContext = await createTestContextWithTemplate('basic');
      
      expect(testContext.templateName).toBe('basic');
      expect(testContext.tenant).toBeDefined();
      expect(testContext.database).toBeDefined();
      expect(testContext.metabase).toBeDefined();
      expect(testContext.jwtToken).toBeDefined();
      
      // Verify schemas exist
      const schemas = await testContext.metabase.selectAny('schema');
      const schemaNames = schemas.map((s: any) => s.name);
      expect(schemaNames).toContain('account');
      expect(schemaNames).toContain('contact');
      
      // Verify data exists with relationships
      const accounts = await testContext.database.selectAny('account');
      const contacts = await testContext.database.selectAny('contact');
      
      expect(accounts.length).toBeGreaterThan(0);
      expect(contacts.length).toBeGreaterThan(0);
      
      // Verify relationships work
      const linkedContacts = contacts.filter((c: any) => c.account_id);
      expect(linkedContacts.length).toBeGreaterThan(0);
      
      // Test a specific relationship
      const firstLinkedContact = linkedContacts[0];
      const referencedAccount = await testContext.database.selectOne('account', {
        where: { id: firstLinkedContact.account_id }
      });
      expect(referencedAccount).toBeDefined();
      expect(referencedAccount.id).toBe(firstLinkedContact.account_id);
      
    }, 45000); // Increase timeout for full integration test
    
  });
  
  describe('Data Quality Validation', () => {
    
    test('generated data should pass validation', async () => {
      const generator = new AccountGenerator();
      const records = generator.generate(5, { realistic_names: true });
      
      const validation = generator.validate(records, { realistic_names: true });
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.recordCounts.AccountGenerator).toBe(5);
    });
    
    test('should detect validation errors', () => {
      const generator = new AccountGenerator();
      
      // Create invalid records (missing id fields)
      const invalidRecords = [
        { name: 'Test', email: 'test@example.com' }, // Missing id
        { id: 'valid-id', name: 'Valid', email: 'valid@example.com' }
      ];
      
      const validation = generator.validate(invalidRecords, {});
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Record 0: Missing required \'id\' field');
    });
    
  });
  
});