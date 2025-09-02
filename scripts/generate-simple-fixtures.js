#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Account generator based on the schema
function generateAccount(index) {
  const accountTypes = ['personal', 'business', 'trial', 'premium'];
  const themes = ['light', 'dark'];
  const languages = ['en', 'es'];
  
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    username: faker.internet.username() + '_' + index.toString().padStart(4, '0'),
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
    phone: faker.datatype.boolean(0.6) ? faker.phone.number() : undefined // 60% have phone
  };
}

// Contact generator based on the schema
function generateContact(index) {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.datatype.boolean(0.8) ? faker.phone.number() : undefined,
    company: faker.datatype.boolean(0.6) ? faker.company.name() : undefined,
    message: faker.datatype.boolean(0.7) ? faker.lorem.paragraph() : undefined,
    status: faker.helpers.arrayElement(['pending', 'contacted', 'resolved']),
    created_at: faker.date.recent({ days: 90 }).toISOString()
  };
}

const generators = {
  'account.json': generateAccount,
  'contact.json': generateContact
};

async function generateLargeFixtures() {
  const basicSchemasDir = path.join(__dirname, '../fixtures/basic/schemas');
  const outputDir = path.join(__dirname, '../fixtures/basic-large/data');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Read all schema files
  const schemaFiles = fs.readdirSync(basicSchemasDir)
    .filter(file => file.endsWith('.json'));
  
  console.log(`Generating large fixtures for ${schemaFiles.length} schemas...`);
  
  for (const schemaFile of schemaFiles) {
    const generator = generators[schemaFile];
    
    if (!generator) {
      console.log(`⚠ No generator found for ${schemaFile}, skipping...`);
      continue;
    }
    
    console.log(`Generating 1000 records for ${schemaFile}...`);
    
    const records = [];
    
    // Generate 1000 unique records
    for (let i = 0; i < 1000; i++) {
      try {
        const record = generator(i);
        records.push(record);
        
        // Progress indicator
        if ((i + 1) % 200 === 0) {
          console.log(`  Generated ${i + 1}/1000 records...`);
        }
      } catch (error) {
        console.error(`Error generating record ${i} for ${schemaFile}:`, error.message);
      }
    }
    
    // Write generated data
    const outputFile = path.join(outputDir, schemaFile);
    fs.writeFileSync(outputFile, JSON.stringify(records, null, 2));
    
    console.log(`✓ Generated ${records.length} records for ${schemaFile}`);
  }
  
  console.log('\n✓ Large fixture generation completed!');
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  generateLargeFixtures().catch(error => {
    console.error('Error generating large fixtures:', error);
    process.exit(1);
  });
}

export { generateLargeFixtures };