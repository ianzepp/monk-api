#!/usr/bin/env node
import { config } from 'dotenv';
import { DatabaseConnection } from './dist/lib/database-connection.js';

// Load environment variables
config();

async function testMonkApiNeonConnection() {
    console.log('Testing monk-api connection to Neon...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    
    try {
        console.log('\n1. Testing DatabaseConnection.healthCheck()...');
        const healthResult = await DatabaseConnection.healthCheck();
        
        if (healthResult.success) {
            console.log('✅ Health check passed!');
        } else {
            console.log('❌ Health check failed:', healthResult.error);
            process.exit(1);
        }

        console.log('\n2. Testing getMainPool()...');
        const mainPool = DatabaseConnection.getMainPool();
        console.log('✅ Main pool created successfully');

        console.log('\n3. Testing direct query to monk_main...');
        const client = await mainPool.connect();
        const result = await client.query('SELECT version(), current_database(), current_user');
        client.release();
        
        console.log('✅ Query successful!');
        console.log('   PostgreSQL Version:', result.rows[0].version.split(' ')[0], result.rows[0].version.split(' ')[1]);
        console.log('   Current Database:', result.rows[0].current_database);
        console.log('   Current User:', result.rows[0].current_user);

        console.log('\n4. Testing SSL configuration...');
        const sslTest = await mainPool.query('SHOW ssl');
        console.log('✅ SSL Status:', sslTest.rows[0].ssl);

        console.log('\n✅ All tests passed! monk-api can connect to Neon successfully.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        console.log('\n5. Cleaning up connections...');
        await DatabaseConnection.closeConnections();
        console.log('✅ Connections closed.');
    }
}

testMonkApiNeonConnection();