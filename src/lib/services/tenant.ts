/**
 * TenantService - Consolidated tenant and authentication operations
 * 
 * Handles all operations related to tenant management and authentication
 * against the monk-api-auth database (tenant registry database).
 * 
 * WARNING: This service makes direct database calls and should NEVER be used
 * by the API server. It's intended for CLI operations and testing only.
 * 
 * Consolidates functionality from:
 * - AuthService (login, JWT operations, tenant validation)
 * - TenantManager (tenant CRUD operations)
 */

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sign, verify } from 'hono/jwt';
import { DatabaseManager } from '../database-manager.js';
import pg from 'pg';

export interface TenantInfo {
  name: string;
  host: string;
  database: string;
}

export interface JWTPayload {
    sub: string;           // Subject/system identifier
    user_id: string | null; // User ID for database records (null for root/system)
    tenant: string;        // Tenant name
    database: string;      // Database name (converted)
    access: string;        // Access level (deny/read/edit/full/root)
    access_read: string[]; // ACL read access
    access_edit: string[]; // ACL edit access
    access_full: string[]; // ACL full access
    iat: number;           // Issued at
    exp: number;           // Expires at
    [key: string]: any;    // Index signature for Hono compatibility
}

export interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    tenant: string;
    database: string;
    access: string;
  };
}

export class TenantService {
  private static jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-change-this';
  private static tokenExpiry = 24 * 60 * 60; // 24 hours in seconds
  private static authPool: pg.Pool | null = null;

  // ==========================================
  // TENANT MANAGEMENT OPERATIONS
  // ==========================================

  /**
   * Get default auth database connection string
   */
  private static getAuthConnectionString(): string {
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    return `postgresql://${dbUser}@${dbHost}:${dbPort}/monk-api-auth`;
  }

  /**
   * Get persistent auth database connection pool
   */
  private static getAuthDatabase(): pg.Pool {
    if (!this.authPool) {
      // Parse DATABASE_URL to extract components
      const dbUrl = process.env.DATABASE_URL || `postgresql://${process.env.USER || 'postgres'}@localhost:5432/`;
      
      try {
        const url = new URL(dbUrl);
        
        this.authPool = new pg.Pool({
          host: url.hostname,
          port: parseInt(url.port) || 5432,
          database: 'monk-api-auth',
          user: url.username || process.env.USER || 'postgres',
          password: url.password || '', // Ensure password is string
          max: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });
      } catch (error) {
        // Fallback to connection string if URL parsing fails
        const authConnectionString = dbUrl.replace(/\/[^\/]*$/, '/monk-api-auth');
        
        this.authPool = new pg.Pool({
          connectionString: authConnectionString,
          max: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });
      }
    }
    return this.authPool;
  }

  /**
   * Convert tenant name to snake_case database naming convention
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
   * Check if tenant already exists
   */
  static async tenantExists(tenantName: string): Promise<boolean> {
    const client = new Client({ connectionString: this.getAuthConnectionString() });
    
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
  static async databaseExists(databaseName: string): Promise<boolean> {
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
  static async createTenant(tenantName: string, host: string = 'localhost', force: boolean = false): Promise<TenantInfo> {
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
  static async deleteTenant(tenantName: string, force: boolean = false): Promise<void> {
    const databaseName = this.tenantNameToDatabase(tenantName);
    
    if (!force && !await this.tenantExists(tenantName)) {
      throw new Error(`Tenant '${tenantName}' does not exist`);
    }
    
    // Remove tenant record from auth database
    const authClient = new Client({ connectionString: this.getAuthConnectionString() });
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
  static async listTenants(): Promise<TenantInfo[]> {
    const client = new Client({ connectionString: this.getAuthConnectionString() });
    
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
  static async getTenant(tenantName: string): Promise<TenantInfo | null> {
    const client = new Client({ connectionString: this.getAuthConnectionString() });
    
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

  // ==========================================
  // AUTHENTICATION OPERATIONS
  // ==========================================

  /**
   * Generate JWT token for user
   */
  static async generateToken(user: any): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      user_id: user.user_id || null, // User ID for database records (null for root/system)
      tenant: user.tenant,
      database: user.database,
      access: user.access || 'root', // Access level for API operations
      access_read: user.access_read || [],
      access_edit: user.access_edit || [],
      access_full: user.access_full || [],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.tokenExpiry
    };

    return await sign(payload, this.jwtSecret);
  }

  /**
   * Verify and decode JWT token
   */
  static async verifyToken(token: string): Promise<JWTPayload> {
    return await verify(token, this.jwtSecret) as JWTPayload;
  }

  /**
   * Login with tenant and username authentication
   */
  static async login(tenant: string, username: string): Promise<LoginResult | null> {
    if (!tenant || !username) {
      return null; // Both tenant and username required
    }

    // Look up tenant record to get database name
    const authDb = this.getAuthDatabase();
    const tenantResult = await authDb.query(
      'SELECT name, database FROM tenants WHERE name = $1',
      [tenant]
    );

    if (!tenantResult.rows || tenantResult.rows.length === 0) {
      return null; // Tenant not found or inactive
    }

    const { name, database } = tenantResult.rows[0];

    // Look up user in the tenant's database
    const tenantDb = await DatabaseManager.getDatabaseForDomain(database);
    const userResult = await tenantDb.query(
      'SELECT id, tenant_name, name, access, access_read, access_edit, access_full, access_deny FROM users WHERE tenant_name = $1 AND name = $2 AND trashed_at IS NULL AND deleted_at IS NULL',
      [tenant, username]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      return null; // User not found or inactive
    }

    const user = userResult.rows[0];

    // Create user object for JWT
    const authUser = {
      id: user.id,
      user_id: user.id,
      tenant: name,
      database: database,
      username: user.name,
      access: user.access,
      access_read: user.access_read || [],
      access_edit: user.access_edit || [],
      access_full: user.access_full || [],
      access_deny: user.access_deny || [],
      is_active: true
    };

    // Generate token
    const token = await this.generateToken(authUser);

    return {
      token,
      user: {
        id: authUser.id,
        username: authUser.username,
        tenant: authUser.tenant,
        database: authUser.database,
        access: authUser.access
      }
    };
  }

  /**
   * Validate JWT token and return payload
   */
  static async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      return await this.verifyToken(token);
    } catch (error) {
      return null; // Invalid token
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Create PostgreSQL database
   */
  private static async createDatabase(databaseName: string): Promise<void> {
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
  private static async dropDatabase(databaseName: string): Promise<void> {
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
  private static async initializeTenantSchema(databaseName: string): Promise<void> {
    const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const tenantConnection = `postgresql://${dbUser}@${dbHost}:${dbPort}/${databaseName}`;
    
    const client = new Client({ connectionString: tenantConnection });
    
    try {
      await client.connect();
      
      // Load and execute init-tenant.sql
      const sqlPath = join(__dirname, '../../../sql/init-tenant.sql');
      const initSql = readFileSync(sqlPath, 'utf8');
      
      await client.query(initSql);
    } finally {
      await client.end();
    }
  }

  /**
   * Create root user in tenant database
   */
  private static async createRootUser(databaseName: string, tenantName: string): Promise<void> {
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
  private static async insertTenantRecord(tenantName: string, host: string, databaseName: string): Promise<void> {
    const client = new Client({ connectionString: this.getAuthConnectionString() });
    
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