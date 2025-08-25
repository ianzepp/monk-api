/**
 * TemplateDatabase - Template database management for fast test setup
 * 
 * Creates and manages template databases that can be quickly cloned for testing.
 * Uses PostgreSQL's CREATE DATABASE WITH TEMPLATE for fast database copying.
 * 
 * Independent from TenantService - handles its own database connections and operations.
 */

import { Client } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface TenantInfo {
  name: string;
  host: string;
  database: string;
}

export class TemplateDatabase {
  private static readonly TEMPLATE_PREFIX = 'monk-api$test-template-';
  
  /**
   * Get DATABASE_URL from ~/.config/monk/env.json with early failure
   */
  private static getConfiguredDatabaseUrl(): string {
    const configPath = join(process.env.HOME!, '.config/monk/env.json');
    
    if (!existsSync(configPath)) {
      throw new Error('Configuration file not found: ~/.config/monk/env.json');
    }
    
    let config: any;
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Invalid JSON in ~/.config/monk/env.json: ${error}`);
    }
    
    if (!config.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured in ~/.config/monk/env.json');
    }
    
    return config.DATABASE_URL;
  }
  
  /**
   * Get connection string for postgres database (for admin operations)
   */
  private static getPostgresConnection(): string {
    const baseUrl = this.getConfiguredDatabaseUrl();
    return baseUrl.replace(/\/[^\/]*$/, '/postgres');
  }
  
  /**
   * Get connection string for specific template database
   */
  private static getTemplateConnection(templateName: string): string {
    const baseUrl = this.getConfiguredDatabaseUrl();
    const templateDbName = `${this.TEMPLATE_PREFIX}${templateName}`;
    return baseUrl.replace(/\/[^\/]*$/, `/${templateDbName}`);
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
    const client = new Client({ connectionString: this.getPostgresConnection() });
    
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
    const client = new Client({ connectionString: this.getPostgresConnection() });
    
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
    const client = new Client({ connectionString: this.getPostgresConnection() });
    
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
      console.log(`Template database already exists: ${templateDbName}`);
      return templateDbName;
    }
    
    console.log(`Creating template database: ${templateDbName}`);
    
    // Create the PostgreSQL database
    await this.createDatabase(templateDbName);
    
    try {
      // Initialize template database with tenant schema and root user
      await this.initializeTemplateDatabase(templateName);
      
      console.log(`✅ Template database created: ${templateDbName}`);
      return templateDbName;
      
    } catch (error) {
      // Leave artifacts for debugging as requested
      console.error(`❌ Template database creation failed: ${templateDbName}`);
      console.error('Template database left for debugging. Use `npm run fixtures:clean` to remove.');
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
    
    console.log(`⚡ Cloning tenant database from template: ${tenantDbName} (template: ${templateDbName})`);
    
    // Fast clone using PostgreSQL template feature
    await this.cloneDatabaseFromTemplate(templateDbName, tenantDbName);
    
    console.log(`✅ Tenant database cloned: ${tenantDbName}`);
    
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
    const client = new Client({ connectionString: this.getPostgresConnection() });
    
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
      console.log(`Template database does not exist: ${templateDbName}`);
      return;
    }
    
    console.log(`🗑️  Dropping template database: ${templateDbName}`);
    await this.dropDatabase(templateDbName);
    console.log(`✅ Template database dropped: ${templateDbName}`);
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
      console.log(pattern 
        ? `No templates found matching pattern: ${pattern}`
        : 'No templates found to clean'
      );
      return;
    }
    
    console.log(`🧹 Cleaning ${templatesToClean.length} template(s)...`);
    
    for (const templateName of templatesToClean) {
      await this.dropTemplate(templateName);
    }
    
    console.log(`✅ Cleaned ${templatesToClean.length} template database(s)`);
  }
  
  /**
   * Build basic template with account and contact schemas
   */
  static async buildBasicTemplate(): Promise<void> {
    const templateName = 'basic';
    
    console.log(`🔨 Building basic template...`);
    
    // Create template database
    await this.createTemplateDatabase(templateName);
    
    // Get path to schema files (fail fast if missing)
    const accountSchemaPath = join(process.cwd(), 'test/fixtures/schema/account.yaml');
    const contactSchemaPath = join(process.cwd(), 'test/fixtures/schema/contact.yaml');
    
    if (!existsSync(accountSchemaPath)) {
      throw new Error(`Schema file not found: ${accountSchemaPath}`);
    }
    
    if (!existsSync(contactSchemaPath)) {
      throw new Error(`Schema file not found: ${contactSchemaPath}`);
    }
    
    // TODO: Add schema and data population
    // This will be implemented when we have the test helper infrastructure
    // For now, just create the empty template database
    
    console.log(`✅ Basic template built: ${this.getTemplateDbName(templateName)}`);
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
    const client = new Client({ connectionString: this.getPostgresConnection() });
    
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
    const client = new Client({ connectionString: this.getTemplateConnection(templateName) });
    
    try {
      await client.connect();
      
      // Load and execute init-tenant.sql
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