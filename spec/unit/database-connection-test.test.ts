import { describe, test, expect } from 'vitest';
import { MonkEnv } from '@lib/monk-env.js';
import { DatabaseManager } from '@lib/database-manager.js';
import pg from 'pg';

describe('Direct Database Connection Test', () => {
  
  test('should connect to database directly without TenantService', async () => {
    // Load monk configuration
    MonkEnv.load();
    
    console.log(`🔍 DATABASE_URL: ${process.env.DATABASE_URL}`);
    
    // Test direct connection using same approach as main API
    const baseUrl = process.env.DATABASE_URL || `postgresql://${process.env.USER || 'postgres'}@localhost:5432/`;
    
    // Connect to existing local-test database (should already exist)
    const testConnectionString = baseUrl.replace(/\/[^\/]*$/, '/monk-api$local-test');
    
    console.log(`🔍 Test Connection String: ${testConnectionString}`);
    
    const testPool = new pg.Pool({
      connectionString: testConnectionString,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 2000,
    });
    
    try {
      // Test the connection
      const client = await testPool.connect();
      
      // Try to query schema table
      const result = await client.query('SELECT name, status FROM schema LIMIT 5');
      
      console.log(`✅ Connected successfully, found ${result.rows.length} schemas`);
      console.log(`📄 Schemas:`, result.rows.map(r => r.name));
      
      client.release();
      
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
      
    } catch (error) {
      console.error(`❌ Direct database connection failed:`, error);
      throw error;
    } finally {
      await testPool.end();
    }
  });

  test('should connect to auth database directly', async () => {
    // Load monk configuration
    MonkEnv.load();
    
    const baseUrl = process.env.DATABASE_URL || `postgresql://${process.env.USER || 'postgres'}@localhost:5432/`;
    
    // Connect to auth database
    const authConnectionString = baseUrl.replace(/\/[^\/]*$/, '/monk-api-auth');
    
    console.log(`🔍 Auth Connection String: ${authConnectionString}`);
    
    const authPool = new pg.Pool({
      connectionString: authConnectionString,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 2000,
    });
    
    try {
      // Test the auth database connection
      const client = await authPool.connect();
      
      // Try to query tenants table
      const result = await client.query('SELECT name, host FROM tenants LIMIT 5');
      
      console.log(`✅ Auth database connected successfully, found ${result.rows.length} tenants`);
      console.log(`🏢 Tenants:`, result.rows.map(r => r.name));
      
      client.release();
      
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
      
    } catch (error) {
      console.error(`❌ Auth database connection failed:`, error);
      throw error;
    } finally {
      await authPool.end();
    }
  });

  test('should test DatabaseManager.getDatabaseForDomain method', async () => {
    // Test the actual method the main API uses
    try {
      const pool = await DatabaseManager.getDatabaseForDomain('local-test');
      
      // Test query
      const client = await pool.connect();
      const result = await client.query('SELECT COUNT(*) as count FROM schema');
      client.release();
      
      console.log(`✅ DatabaseManager connection works, schema count: ${result.rows[0].count}`);
      
      expect(result.rows[0].count).toBeDefined();
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
      
    } catch (error) {
      console.error(`❌ DatabaseManager connection failed:`, error);
      throw error;
    }
  });

  test('should test exact same connection approach as TenantService', async () => {
    // Load monk configuration
    MonkEnv.load();
    
    // Use EXACT same logic as TenantService.getAuthDatabase()
    const baseUrl = process.env.DATABASE_URL || `postgresql://${process.env.USER || 'postgres'}@localhost:5432/`;
    
    try {
      const url = new URL(baseUrl);
      
      console.log(`🔍 Parsed URL components:`);
      console.log(`   hostname: ${url.hostname}`);
      console.log(`   port: ${url.port}`);
      console.log(`   username: ${url.username}`);
      console.log(`   password: ${url.password ? '[PRESENT]' : '[MISSING]'}`);
      
      const testPool = new pg.Pool({
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: 'monk-api-auth',
        user: url.username || process.env.USER || 'postgres',
        password: String(url.password || ''), // Ensure password is string
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 2000,
      });
      
      // Test connection
      const client = await testPool.connect();
      const result = await client.query('SELECT current_user');
      client.release();
      
      console.log(`✅ TenantService-style connection works: ${result.rows[0].current_user}`);
      
      expect(result.rows[0].current_user).toBeDefined();
      
      await testPool.end();
      
    } catch (error) {
      console.error(`❌ TenantService-style connection failed:`, error);
      throw error;
    }
  });
});