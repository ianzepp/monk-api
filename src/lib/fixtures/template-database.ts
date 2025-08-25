/**
 * TemplateDatabase - Template database management for fast test setup
 * 
 * Creates and manages template databases that can be quickly cloned for testing.
 * Uses PostgreSQL's CREATE DATABASE WITH TEMPLATE for fast database copying.
 * 
 * Independent from TenantService - handles its own database connections and operations.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DatabaseConnection } from '../database-connection.js';
import { logger } from '@lib/logger.js';
import pg from 'pg';

import type { TenantInfo } from '../services/tenant.js';

// Re-export for convenience
export type { TenantInfo };

export class TemplateDatabase {
  private static readonly TEMPLATE_PREFIX = 'monk-api$test-template-';
  
  /**
   * Create postgres client for admin operations
   */
  private static createPostgresClient(): pg.Client {
    return DatabaseConnection.createClient('postgres');
  }
  
  /**
   * Create client for specific database
   */
  private static createDatabaseClient(databaseName: string): pg.Client {
    return DatabaseConnection.createClient(databaseName);
  }
  /**
   * Get full template database name
   */
  private static getTemplateDbName(templateName: string): string {
    return `${this.TEMPLATE_PREFIX}${templateName}`;
  }
  
  /**
   * Check if database exists
   */
  static async databaseExists(databaseName: string): Promise<boolean> {
    const client = this.createPostgresClient();
    
    try {
      await client.connect();
      
      const result = await client.query(
        'SELECT COUNT(*) as count FROM pg_database WHERE datname = $1',
        [databaseName]
      );
      
      return parseInt(result.rows[0].count) > 0;
    } finally {
      await client.end();
    }
  }
  
  /**
   * Create PostgreSQL database
   */
  private static async createDatabase(databaseName: string): Promise<void> {
    const client = this.createPostgresClient();
    
    try {
      await client.connect();
      // Note: Database names cannot be parameterized, but we control the template name
      await client.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await client.end();
    }
  }
  
  /**
   * Drop PostgreSQL database (public for testing)
   */
  static async dropDatabase(databaseName: string): Promise<void> {
    const client = this.createPostgresClient();
    
    try {
      await client.connect();
      // Note: Database names cannot be parameterized, but we control the template name
      await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    } finally {
      await client.end();
    }
  }
  
  /**
   * Create template database with tenant schema and root user
   */
  static async createTemplateDatabase(templateName: string): Promise<string> {
    const templateDbName = this.getTemplateDbName(templateName);
    
    // Check if template already exists
    if (await this.databaseExists(templateDbName)) {
      logger.info(`Template database already exists: ${templateDbName}`);
      return templateDbName;
    }
    
    logger.info(`Creating template database: ${templateDbName}`);
    
    // Create the PostgreSQL database
    await this.createDatabase(templateDbName);
    
    try {
      // Initialize template database with tenant schema and root user
      await this.initializeTemplateDatabase(templateName);
      
      logger.info(`✅ Template database created: ${templateDbName}`);
      return templateDbName;
      
    } catch (error) {
      // Leave artifacts for debugging as requested
      logger.warn('Template database creation failed', { 
        templateDbName, 
        error: error instanceof Error ? error.message : String(error),
        debugNote: 'Template database left for debugging. Use `npm run fixtures:clean` to remove.'
      });
      throw error;
    }
  }
  
  /**
   * Create tenant database from template using PostgreSQL cloning
   */
  static async createTenantFromTemplate(tenantName: string, templateName: string): Promise<TenantInfo> {
    const templateDbName = this.getTemplateDbName(templateName);
    const tenantDbName = this.tenantNameToDatabase(tenantName);
    
    // Ensure template exists
    if (!await this.databaseExists(templateDbName)) {
      throw new Error(`Template database '${templateDbName}' does not exist. Run 'npm run fixtures:build' first.`);
    }
    
    // Check if tenant database already exists
    if (await this.databaseExists(tenantDbName)) {
      throw new Error(`Tenant database '${tenantDbName}' already exists`);
    }
    
    logger.info(`⚡ Cloning tenant database from template: ${tenantDbName} (template: ${templateDbName})`);
    
    // Fast clone using PostgreSQL template feature
    await this.cloneDatabaseFromTemplate(templateDbName, tenantDbName);
    
    logger.info(`✅ Tenant database cloned: ${tenantDbName}`);
    
    return {
      name: tenantName,
      host: 'localhost',
      database: tenantDbName
    };
  }
  
  /**
   * List available template databases
   */
  static async listTemplates(): Promise<string[]> {
    const client = this.createPostgresClient();
    
    try {
      await client.connect();
      const result = await client.query(
        `SELECT datname FROM pg_database WHERE datname LIKE '${this.TEMPLATE_PREFIX}%' ORDER BY datname`
      );
      return result.rows.map(row => row.datname.replace(this.TEMPLATE_PREFIX, ''));
    } finally {
      await client.end();
    }
  }
  
  /**
   * Drop template database
   */
  static async dropTemplate(templateName: string): Promise<void> {
    const templateDbName = this.getTemplateDbName(templateName);
    
    if (!await this.databaseExists(templateDbName)) {
      logger.info(`Template database does not exist: ${templateDbName}`);
      return;
    }
    
    logger.info(`🗑️  Dropping template database: ${templateDbName}`);
    await this.dropDatabase(templateDbName);
    logger.info(`✅ Template database dropped: ${templateDbName}`);
  }
  
  /**
   * Clean up template databases by pattern
   */
  static async cleanTemplates(pattern?: string): Promise<void> {
    const templates = await this.listTemplates();
    
    const templatesToClean = pattern 
      ? templates.filter(name => name.includes(pattern))
      : templates;
    
    if (templatesToClean.length === 0) {
      logger.info(pattern 
        ? `No templates found matching pattern: ${pattern}`
        : 'No templates found to clean'
      );
      return;
    }
    
    logger.info(`🧹 Cleaning ${templatesToClean.length} template(s)...`);
    
    for (const templateName of templatesToClean) {
      await this.dropTemplate(templateName);
    }
    
    logger.info(`✅ Cleaned ${templatesToClean.length} template database(s)`);
  }
  
  /**
   * Build template from fixture definition
   */
  static async buildTemplateFromFixture(fixtureName: string): Promise<void> {
    logger.info(`🔨 Building template from fixture: ${fixtureName}`);
    
    // Create template database
    const templateDbName = await this.createTemplateDatabase(fixtureName);
    
    // Create tenant info for template operations
    const templateTenant: TenantInfo = {
      name: `template-${fixtureName}`,
      host: 'localhost',
      database: templateDbName
    };
    
    try {
      // Import FixtureManager dynamically to avoid circular dependencies
      const { FixtureManager } = await import('./fixture-manager.js');
      
      // Load fixture definition
      const fixture = await FixtureManager.loadFixtureDefinition(fixtureName);
      logger.info(`📋 Loaded fixture definition: ${fixture.description}`);
      
      // Build fixture data
      const fixtureData = await FixtureManager.buildFixtureData(fixture);
      
      // Build template with data
      await FixtureManager.buildTemplateWithData(fixtureName, fixtureData, templateTenant, true);
      
      logger.info(`✅ Template built from fixture: ${templateDbName}`);
      logger.info(`📊 Total records: ${fixtureData.metadata.total_records}`);
      logger.info(`📈 Schemas: ${Object.keys(fixtureData.schemas).join(', ')}`);
      
    } catch (error) {
      // Leave template database for debugging as requested
      logger.warn('Template building failed', { 
        fixtureName, 
        templateDbName,
        error: error instanceof Error ? error.message : String(error),
        debugNote: 'Template database left for debugging. Use `npm run fixtures:clean` to remove.'
      });
      throw error;
    }
  }
  
  /**
   * Build basic template with account and contact schemas (legacy method)
   */
  static async buildBasicTemplate(): Promise<void> {
    // Use fixture-based building for consistency
    await this.buildTemplateFromFixture('basic');
  }
  
  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================
  
  /**
   * Convert tenant name to database name (copied pattern from TenantService)
   */
  private static tenantNameToDatabase(tenantName: string): string {
    const snakeCase = tenantName
      .replace(/[^a-zA-Z0-9]/g, '-')  // Replace non-alphanumeric with dashes
      .replace(/--+/g, '-')          // Collapse multiple dashes
      .replace(/^-|-$/g, '')         // Remove leading/trailing dashes
      .toLowerCase();                // Convert to lowercase
    
    return `monk-api$${snakeCase}`;
  }
  
  /**
   * Clone database using PostgreSQL template feature (very fast)
   */
  private static async cloneDatabaseFromTemplate(templateName: string, targetName: string): Promise<void> {
    const client = this.createPostgresClient();
    
    try {
      await client.connect();
      // PostgreSQL template cloning (very fast - copies entire database structure and data)
      await client.query(`CREATE DATABASE "${targetName}" WITH TEMPLATE "${templateName}"`);
    } finally {
      await client.end();
    }
  }
  
  /**
   * Initialize template database with tenant schema and root user
   */
  private static async initializeTemplateDatabase(templateName: string): Promise<void> {
    const client = this.createDatabaseClient(this.getTemplateDbName(templateName));
    
    try {
      await client.connect();
      
      // Load and execute init-tenant.sql
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const sqlPath = join(__dirname, '../../../sql/init-tenant.sql');
      
      if (!existsSync(sqlPath)) {
        throw new Error(`Tenant initialization SQL not found: ${sqlPath}`);
      }
      
      const initSql = readFileSync(sqlPath, 'utf8');
      await client.query(initSql);
      
      // Create root user in template database (using 'template' as tenant name)
      await client.query(
        'INSERT INTO users (tenant_name, name, access) VALUES ($1, $2, $3)',
        ['template', 'root', 'root']
      );
      
    } finally {
      await client.end();
    }
  }
}