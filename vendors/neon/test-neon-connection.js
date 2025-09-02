#!/usr/bin/env node
import { config } from 'dotenv';
import pg from 'pg';

// Load environment variables
config();

const { Client } = pg;

async function testConnection() {
    console.log('Testing Neon PostgreSQL connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
    });

    try {
        console.log('\n1. Connecting to Neon...');
        await client.connect();
        console.log('✅ Connected successfully!');

        console.log('\n2. Testing basic query...');
        const result = await client.query('SELECT version(), current_database(), current_user');
        console.log('✅ Query successful!');
        console.log('   PostgreSQL Version:', result.rows[0].version.split(' ')[0], result.rows[0].version.split(' ')[1]);
        console.log('   Current Database:', result.rows[0].current_database);
        console.log('   Current User:', result.rows[0].current_user);

        console.log('\n3. Checking available databases...');
        const dbResult = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname');
        console.log('✅ Available databases:');
        dbResult.rows.forEach(row => console.log('  -', row.datname));

    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n✅ Connection closed.');
    }
}

testConnection();