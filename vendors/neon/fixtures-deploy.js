#!/usr/bin/env node
import { config } from 'dotenv';
import { execSync } from 'child_process';
import pg from 'pg';

// Load environment variables
config();

const { Client } = pg;

async function deployTemplate(templateName, options = {}) {
    const { force = false, progress = false } = options;
    
    console.log(`Deploying template: ${templateName}`);
    
    if (progress) {
        console.log('📡 Connecting to local PostgreSQL...');
    }
    
    // Check if local template exists
    const localDb = `monk_template_${templateName}`;
    const neonDb = `monk_template_${templateName}`;
    
    try {
        // Test local template exists
        execSync(`psql -d ${localDb} -c "SELECT 1" > /dev/null 2>&1`);
    } catch (error) {
        console.error(`❌ Local template '${localDb}' does not exist. Run: npm run fixtures:build ${templateName}`);
        process.exit(1);
    }
    
    if (progress) {
        console.log('✅ Local template verified');
        console.log('🌐 Connecting to Neon...');
    }
    
    // Check if Neon template exists (connect to default database)
    const neonClient = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
    });
    
    try {
        await neonClient.connect();
        
        const checkResult = await neonClient.query(
            `SELECT datname FROM pg_database WHERE datname = '${neonDb}'`
        );
        
        if (checkResult.rows.length > 0 && !force) {
            console.error(`❌ Template '${neonDb}' already exists on Neon. Use --force to overwrite.`);
            process.exit(1);
        }
        
        if (checkResult.rows.length > 0 && force) {
            if (progress) {
                console.log('🗑️  Dropping existing template...');
            }
            await neonClient.query(`DROP DATABASE "${neonDb}"`);
        }
        
        if (progress) {
            console.log('🏗️  Creating empty template database...');
        }
        await neonClient.query(`CREATE DATABASE "${neonDb}"`);
        
    } catch (error) {
        console.error('❌ Neon connection failed:', error.message);
        process.exit(1);
    } finally {
        await neonClient.end();
    }
    
    if (progress) {
        console.log('📦 Copying template data...');
    }
    
    // Copy data using pg_dump | psql
    const neonUrl = new URL(process.env.DATABASE_URL);
    neonUrl.pathname = `/${neonDb}`;
    const neonConnectionString = neonUrl.toString();
    const copyCommand = `pg_dump ${localDb} | psql "${neonConnectionString}"`;
    
    try {
        execSync(copyCommand, { 
            stdio: progress ? 'inherit' : 'pipe',
            encoding: 'utf8'
        });
        
        if (progress) {
            console.log('✅ Template deployed successfully!');
        } else {
            console.log(`✅ Template '${templateName}' deployed to Neon`);
        }
        
    } catch (error) {
        console.error('❌ Template deployment failed:', error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const templateName = args[0];
const force = args.includes('--force');
const progress = args.includes('--progress');

if (!templateName) {
    console.error('❌ Usage: node vendors/neon/fixtures-deploy.js <template-name> [--force] [--progress]');
    console.error('   Example: node vendors/neon/fixtures-deploy.js basic --progress');
    process.exit(1);
}

deployTemplate(templateName, { force, progress });