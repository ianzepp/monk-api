import { describe, test, expect } from 'vitest';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import pg from 'pg';

describe('Direct Database Connection Test', () => {
  
  test('should connect to database directly without TenantService', async () => {
    console.info(`🔍 DATABASE_URL: ${process.env.DATABASE_URL}`);
    
    // Test direct connection using DatabaseConnection
    const testPool = DatabaseConnection.getTenantPool('local_test');
    
    console.info(`🔍 Testing tenant pool for: local_test`);
    
    try {
      // Test the connection
      const client = await testPool.connect();
      
      // Try to query schema table
      const result = await client.query('SELECT name, status FROM schema LIMIT 5');
      
      console.info(`✅ Connected successfully, found ${result.rows.length} schemas`);
      console.info(`📄 Schemas:`, result.rows.map(r => r.name));
      
      client.release();
      
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
      
    } catch (error) {
      console.error(`❌ Direct database connection failed:`, error);
      throw error;
    } finally {
      // Note: Don't end shared pool - it's managed by DatabaseConnection
    }
  });

  test('should connect to auth database directly', async () => {
    // Connect to auth database using DatabaseConnection
    const authPool = DatabaseConnection.getBasePool();
    
    console.info(`🔍 Testing base pool for auth database`);
    
    try {
      // Test the auth database connection
      const client = await authPool.connect();
      
      // Try to query tenant table
      const result = await client.query('SELECT name, host FROM tenant LIMIT 5');
      
      console.info(`✅ Auth database connected successfully, found ${result.rows.length} tenants`);
      console.info(`🏢 Tenants:`, result.rows.map(r => r.name));
      
      client.release();
      
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
      
    } catch (error) {
      console.error(`❌ Auth database connection failed:`, error);
      throw error;
    } finally {
      // Note: Don't end shared pool - it's managed by DatabaseConnection
    }
  });

  test('should test DatabaseConnection.getTenantPool method', async () => {
    // Test the actual method the main API uses
    try {
      const pool = DatabaseConnection.getTenantPool('local_test');
      
      // Test query
      const client = await pool.connect();
      const result = await client.query('SELECT COUNT(*) as count FROM schema');
      client.release();
      
      console.info(`✅ DatabaseConnection connection works, schema count: ${result.rows[0].count}`);
      
      expect(result.rows[0].count).toBeDefined();
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
      
    } catch (error) {
      console.error(`❌ DatabaseConnection connection failed:`, error);
      throw error;
    }
  });

  test('should test exact same connection approach as TenantService', async () => {
    // Use mock database URL for auth testing
    const baseUrl = `postgresql://testuser@localhost:5432/`;
    
    try {
      const url = new URL(baseUrl);
      
      console.info(`🔍 Parsed URL components:`);
      console.info(`   hostname: ${url.hostname}`);
      console.info(`   port: ${url.port}`);
      console.info(`   username: ${url.username}`);
      console.info(`   password: ${url.password ? '[PRESENT]' : '[MISSING]'}`);
      
      const testPool = new pg.Pool({
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: 'monk',
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
      
      console.info(`✅ TenantService-style connection works: ${result.rows[0].current_user}`);
      
      expect(result.rows[0].current_user).toBeDefined();
      
      await testPool.end();
      
    } catch (error) {
      console.error(`❌ TenantService-style connection failed:`, error);
      throw error;
    }
  });
});