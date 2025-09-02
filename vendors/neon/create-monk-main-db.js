#!/usr/bin/env node
import { config } from 'dotenv';
import pg from 'pg';

// Load environment variables
config();

const { Client } = pg;

async function createMonkMainDatabase() {
    console.log('Creating monk_main database on Neon...');
    
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
    });

    try {
        console.log('\n1. Connecting to Neon...');
        await client.connect();
        console.log('✅ Connected successfully!');

        console.log('\n2. Checking if monk_main database exists...');
        const checkResult = await client.query(
            "SELECT datname FROM pg_database WHERE datname = 'monk_main'"
        );

        if (checkResult.rows.length > 0) {
            console.log('✅ monk_main database already exists');
        } else {
            console.log('\n3. Creating monk_main database...');
            await client.query('CREATE DATABASE monk_main');
            console.log('✅ monk_main database created successfully!');
        }

        console.log('\n4. Verifying monk_main database...');
        const verifyResult = await client.query(
            "SELECT datname FROM pg_database WHERE datname = 'monk_main'"
        );
        
        if (verifyResult.rows.length > 0) {
            console.log('✅ monk_main database verified');
        } else {
            console.log('❌ monk_main database not found after creation');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Database creation failed:', error.message);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n✅ Connection closed.');
    }
}

createMonkMainDatabase();