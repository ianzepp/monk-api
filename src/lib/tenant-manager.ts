/**
 * Tenant Manager - Database-level tenant operations
 * 
 * WARNING: This class makes direct database calls to monk-api-auth and should
 * NEVER be used by the API server. It's intended for CLI operations and testing.
 * 
 * Similar to Auth class, this bypasses the normal System/Database patterns
 * and connects directly to PostgreSQL for tenant management operations.
 */

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface TenantInfo {
  name: string;
  host: string;
  database: string;
}

export class TenantManager {
  private authConnectionString: string;

  constructor(authConnectionString?: string) {
    // Default to standard auth database connection
    this.authConnectionString = authConnectionString || this.getDefaultAuthConnection();
  }

  /**
   * Get default auth database connection string
   */
  private getDefaultAuthConnection(): string {
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    return `postgresql://${dbUser}@${dbHost}:${dbPort}/monk-api-auth`;
  }

  /**
   * Convert tenant name to snake_case database naming convention
   */
  private tenantNameToDatabase(tenantName: string): string {
    const snakeCase = tenantName
      .replace(/[^a-zA-Z0-9]/g, '-')  // Replace non-alphanumeric with dashes
      .replace(/--+/g, '-')          // Collapse multiple dashes
      .replace(/^-|-$/g, '')         // Remove leading/trailing dashes
      .toLowerCase();                // Convert to lowercase
    
    return `monk-api$${snakeCase}`;
  }

  /**
   * Check if tenant already exists
   */
  async tenantExists(tenantName: string): Promise<boolean> {
    const client = new Client({ connectionString: this.authConnectionString });
    
    try {
      await client.connect();
      
      const result = await client.query(
        'SELECT COUNT(*) as count FROM tenants WHERE name = $1',
        [tenantName]
      );
      
      return parseInt(result.rows[0].count) > 0;
    } finally {
      await client.end();
    }
  }

  /**
   * Check if database exists
   */
  async databaseExists(databaseName: string): Promise<boolean> {
    // Connect to postgres database to check if target database exists
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const postgresConnection = `postgresql://${dbUser}@${dbHost}:${dbPort}/postgres`;
    
    const client = new Client({ connectionString: postgresConnection });
    
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
   * Create new tenant with database and auth record
   */
  async createTenant(tenantName: string, host: string = 'localhost', force: boolean = false): Promise<TenantInfo> {
    const databaseName = this.tenantNameToDatabase(tenantName);
    
    // Check if tenant already exists
    if (!force && await this.tenantExists(tenantName)) {
      throw new Error(`Tenant '${tenantName}' already exists (use force=true to override)`);
    }
    
    // Check if database already exists
    if (!force && await this.databaseExists(databaseName)) {
      throw new Error(`Database '${databaseName}' already exists (use force=true to override)`);
    }
    
    // If forcing and tenant exists, delete it first
    if (force) {
      try {
        await this.deleteTenant(tenantName, true);
      } catch (error) {
        // Ignore errors during cleanup - database might not exist
        console.warn(`Warning during cleanup: ${error}`);
      }
    }
    
    // Create the PostgreSQL database
    await this.createDatabase(databaseName);
    
    try {
      // Initialize tenant database schema
      await this.initializeTenantSchema(databaseName);
      
      // Create root user in tenant database
      await this.createRootUser(databaseName, tenantName);
      
      // Insert tenant record in auth database
      await this.insertTenantRecord(tenantName, host, databaseName);
      
      return {
        name: tenantName,
        host: host,
        database: databaseName
      };
      
    } catch (error) {
      // Clean up database if initialization failed
      try {
        await this.dropDatabase(databaseName);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup database after error: ${cleanupError}`);
      }
      throw error;
    }
  }

  /**
   * Delete tenant and its database
   */
  async deleteTenant(tenantName: string, force: boolean = false): Promise<void> {
    const databaseName = this.tenantNameToDatabase(tenantName);
    
    if (!force && !await this.tenantExists(tenantName)) {
      throw new Error(`Tenant '${tenantName}' does not exist`);
    }
    
    // Remove tenant record from auth database
    const authClient = new Client({ connectionString: this.authConnectionString });
    try {
      await authClient.connect();
      await authClient.query(
        'DELETE FROM tenants WHERE name = $1',
        [tenantName]
      );
    } catch (error) {
      if (!force) throw error;
      console.warn(`Warning removing tenant record: ${error}`);
    } finally {
      await authClient.end();
    }
    
    // Drop the database
    try {
      await this.dropDatabase(databaseName);
    } catch (error) {
      if (!force) throw error;
      console.warn(`Warning dropping database: ${error}`);
    }
  }

  /**
   * List all tenants
   */
  async listTenants(): Promise<TenantInfo[]> {
    const client = new Client({ connectionString: this.authConnectionString });
    
    try {
      await client.connect();
      
      const result = await client.query(
        'SELECT name, host, database FROM tenants ORDER BY name'
      );
      
      return result.rows.map(row => ({
        name: row.name,
        host: row.host,
        database: row.database
      }));
    } finally {
      await client.end();
    }
  }

  /**
   * Get tenant information
   */
  async getTenant(tenantName: string): Promise<TenantInfo | null> {
    const client = new Client({ connectionString: this.authConnectionString });
    
    try {
      await client.connect();
      
      const result = await client.query(
        'SELECT name, host, database FROM tenants WHERE name = $1',
        [tenantName]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        name: result.rows[0].name,
        host: result.rows[0].host,
        database: result.rows[0].database
      };
    } finally {
      await client.end();
    }
  }

  /**
   * Create PostgreSQL database
   */
  private async createDatabase(databaseName: string): Promise<void> {
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const postgresConnection = `postgresql://${dbUser}@${dbHost}:${dbPort}/postgres`;
    
    const client = new Client({ connectionString: postgresConnection });
    
    try {
      await client.connect();
      // Note: Database names cannot be parameterized, but we've sanitized the name
      await client.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await client.end();
    }
  }

  /**
   * Drop PostgreSQL database
   */
  private async dropDatabase(databaseName: string): Promise<void> {
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const postgresConnection = `postgresql://${dbUser}@${dbHost}:${dbPort}/postgres`;
    
    const client = new Client({ connectionString: postgresConnection });
    
    try {
      await client.connect();
      // Note: Database names cannot be parameterized, but we've sanitized the name
      await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    } finally {
      await client.end();
    }
  }

  /**
   * Initialize tenant database schema using sql/init-tenant.sql
   */
  private async initializeTenantSchema(databaseName: string): Promise<void> {
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const tenantConnection = `postgresql://${dbUser}@${dbHost}:${dbPort}/${databaseName}`;
    
    const client = new Client({ connectionString: tenantConnection });
    
    try {
      await client.connect();
      
      // Load and execute init-tenant.sql
      const sqlPath = join(__dirname, '../../sql/init-tenant.sql');
      const initSql = readFileSync(sqlPath, 'utf8');
      
      await client.query(initSql);
    } finally {
      await client.end();
    }
  }

  /**
   * Create root user in tenant database
   */
  private async createRootUser(databaseName: string, tenantName: string): Promise<void> {
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const tenantConnection = `postgresql://${dbUser}@${dbHost}:${dbPort}/${databaseName}`;
    
    const client = new Client({ connectionString: tenantConnection });
    
    try {
      await client.connect();
      
      await client.query(
        'INSERT INTO users (tenant_name, name, access) VALUES ($1, $2, $3)',
        [tenantName, 'root', 'root']
      );
    } finally {
      await client.end();
    }
  }

  /**
   * Insert tenant record in auth database
   */
  private async insertTenantRecord(tenantName: string, host: string, databaseName: string): Promise<void> {
    const client = new Client({ connectionString: this.authConnectionString });
    
    try {
      await client.connect();
      
      await client.query(
        'INSERT INTO tenants (name, host, database) VALUES ($1, $2, $3)',
        [tenantName, host, databaseName]
      );
    } finally {
      await client.end();
    }
  }
}