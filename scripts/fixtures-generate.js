#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const templateName = args[0];
const recordCount = parseInt(args[1]) || 100;

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function printStep(message) {
  console.log(`${colors.blue}→ ${message}${colors.reset}`);
}

function printSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function printError(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function printWarning(message) {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

// Generate valid phone number matching schema pattern
function generateValidPhone() {
  // Pattern allows: ^\+?[1-9]\d{1,14}$|^\+?1 \([0-9]{3}\) [0-9]{3}-[0-9]{4}$
  
  if (faker.datatype.boolean(0.7)) {
    // Generate US format: +1 (555) 123-4567
    const area = faker.string.numeric(3, { bannedChars: ['0', '1'] }); // Area code can't start with 0 or 1
    const exchange = faker.string.numeric(3);
    const number = faker.string.numeric(4);
    return `+1 (${area}) ${exchange}-${number}`;
  } else {
    // Generate international format: +[1-9][0-14 more digits]
    const countryCode = faker.helpers.arrayElement(['1', '44', '49', '33', '81', '61', '7']);
    const length = faker.number.int({ min: 6, max: 12 });
    const number = faker.string.numeric(length);
    return `+${countryCode}${number}`;
  }
}

// Account generator based on the schema
function generateAccount(index) {
  const accountTypes = ['personal', 'business', 'trial', 'premium'];
  const themes = ['light', 'dark'];
  const languages = ['en', 'es'];
  
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    username: faker.internet.username().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 46) + '_' + index.toString().padStart(4, '0'),
    account_type: faker.helpers.arrayElement(accountTypes),
    balance: parseFloat(faker.finance.amount(0, 10000, 2)),
    is_active: faker.datatype.boolean(0.8), // 80% chance of being active
    is_verified: faker.datatype.boolean(0.7), // 70% chance of being verified
    credit_limit: faker.datatype.boolean(0.3) ? parseFloat(faker.finance.amount(1000, 10000, 0)) : null, // 30% have credit limit
    last_login: faker.datatype.boolean(0.6) ? faker.date.recent({ days: 30 }).toISOString() : null, // 60% have logged in recently
    preferences: faker.datatype.boolean(0.4) ? { // 40% have custom preferences
      notifications: faker.datatype.boolean(),
      theme: faker.helpers.arrayElement(themes),
      language: faker.helpers.arrayElement(languages)
    } : undefined,
    metadata: faker.datatype.boolean(0.2) ? { // 20% have metadata
      tags: faker.helpers.arrayElements(['vip', 'beta', 'test', 'premium'], { min: 1, max: 3 }),
      source: faker.helpers.arrayElement(['web', 'mobile', 'api'])
    } : undefined,
    phone: faker.datatype.boolean(0.6) ? generateValidPhone() : undefined // 60% have phone
  };
}

// Generate valid contact phone number (simpler pattern)
function generateValidContactPhone() {
  // Pattern: ^\+?[1-9]\d{1,14}$ (no US format, just international)
  const countryCode = faker.helpers.arrayElement(['1', '44', '49', '33', '81', '61', '7']);
  const length = faker.number.int({ min: 6, max: 12 });
  const number = faker.string.numeric(length);
  return faker.datatype.boolean(0.8) ? `+${countryCode}${number}` : `${countryCode}${number}`;
}

// Contact generator based on the schema
function generateContact(index) {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.datatype.boolean(0.8) ? generateValidContactPhone() : undefined,
    company: faker.datatype.boolean(0.6) ? faker.company.name() : undefined,
    notes: faker.datatype.boolean(0.7) ? faker.lorem.paragraph() : undefined,
    status: faker.helpers.arrayElement(['active', 'inactive', 'prospect'])
  };
}

const generators = {
  'account.json': generateAccount,
  'contact.json': generateContact
};

function checkLockFile(fixturesDir) {
  const lockFile = path.join(fixturesDir, '.locked');
  
  if (fs.existsSync(lockFile)) {
    printError(`Template '${templateName}' is locked and cannot be regenerated`);
    printStep('Lock details:');
    
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      console.log(JSON.stringify(lockData, null, 2));
    } catch (error) {
      console.log(fs.readFileSync(lockFile, 'utf8'));
    }
    
    printStep(`To unlock: rm ${lockFile}`);
    process.exit(1);
  }
}

async function generateFixtures() {
  // Validate arguments
  if (!templateName) {
    printError('Usage: npm run fixtures:generate <template-name> <record-count>');
    printError('Example: npm run fixtures:generate basic_large 1000');
    printError('Example: npm run fixtures:generate demo_small 50');
    process.exit(1);
  }

  // Validate template name format
  if (!/^[a-z_]+$/.test(templateName)) {
    printError('Template name must contain only lowercase letters and underscores');
    printError(`Invalid name: '${templateName}'`);
    printError('Valid examples: basic_large, demo_small, test_data');
    printError('Invalid examples: Basic-Large, demo-small, TestData');
    process.exit(1);
  }

  if (recordCount < 1 || recordCount > 10000) {
    printError('Record count must be between 1 and 10000');
    process.exit(1);
  }

  const fixturesDir = path.join(__dirname, '../fixtures', templateName);
  const sourceSchemasDir = path.join(fixturesDir, 'schemas');
  const outputDir = path.join(fixturesDir, 'data');
  
  // Check for lock file
  checkLockFile(fixturesDir);
  
  // Validate source template exists
  if (!fs.existsSync(sourceSchemasDir)) {
    printError(`Template schemas directory not found: ${sourceSchemasDir}`);
    printStep('Available templates:');
    
    const fixturesBaseDir = path.join(__dirname, '../fixtures');
    if (fs.existsSync(fixturesBaseDir)) {
      const templates = fs.readdirSync(fixturesBaseDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      templates.forEach(template => {
        const schemaDir = path.join(fixturesBaseDir, template, 'schemas');
        const status = fs.existsSync(schemaDir) ? '✓' : '✗ (no schemas)';
        console.log(`  ${status} ${template}`);
      });
    }
    
    process.exit(1);
  }
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Read all schema files
  const schemaFiles = fs.readdirSync(sourceSchemasDir)
    .filter(file => file.endsWith('.json'));
  
  if (schemaFiles.length === 0) {
    printError(`No schema files found in: ${sourceSchemasDir}`);
    process.exit(1);
  }
  
  printStep(`Generating fixtures for template: ${templateName}`);
  printStep(`Target: ${recordCount} records per schema`);
  printStep(`Found ${schemaFiles.length} schemas: ${schemaFiles.join(', ')}`);
  
  for (const schemaFile of schemaFiles) {
    const generator = generators[schemaFile];
    
    if (!generator) {
      printWarning(`No generator found for ${schemaFile}, skipping...`);
      continue;
    }
    
    printStep(`Generating ${recordCount} records for ${schemaFile}...`);
    
    const records = [];
    
    // Generate records
    for (let i = 0; i < recordCount; i++) {
      try {
        const record = generator(i);
        records.push(record);
        
        // Progress indicator for large datasets
        if (recordCount >= 100 && (i + 1) % Math.ceil(recordCount / 5) === 0) {
          printStep(`  Generated ${i + 1}/${recordCount} records...`);
        }
      } catch (error) {
        printError(`Error generating record ${i} for ${schemaFile}: ${error.message}`);
        process.exit(1);
      }
    }
    
    // Write generated data
    const outputFile = path.join(outputDir, schemaFile);
    fs.writeFileSync(outputFile, JSON.stringify(records, null, 2));
    
    const sizeKB = Math.round(fs.statSync(outputFile).size / 1024);
    printSuccess(`Generated ${records.length} records for ${schemaFile} (${sizeKB}KB)`);
  }
  
  printSuccess(`Fixture generation completed for template: ${templateName}`);
  printStep(`Output directory: ${outputDir}`);
  printStep(`To lock this template: npm run fixtures:lock ${templateName}`);
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFixtures().catch(error => {
    printError(`Error generating fixtures: ${error.message}`);
    process.exit(1);
  });
}

export { generateFixtures };