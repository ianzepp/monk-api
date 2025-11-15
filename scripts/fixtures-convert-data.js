#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Format value for SQL based on type
function formatValueForSql(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'object') {
    // Serialize objects/arrays to JSON string for JSONB columns
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }

  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Convert JSON data array to SQL INSERT statements
function convertDataToSql(dataArray, tableName) {
  const lines = [];

  lines.push('-- Data records for ' + tableName);
  lines.push('-- Generated from JSON data format');
  lines.push('');

  if (dataArray.length === 0) {
    lines.push('-- No records to insert');
    return lines.join('\n');
  }

  // Get all unique column names from all records
  const allColumns = new Set();
  for (const record of dataArray) {
    for (const key of Object.keys(record)) {
      allColumns.add(key);
    }
  }

  const columnList = Array.from(allColumns);

  // Generate INSERT statements
  for (const record of dataArray) {
    const values = columnList.map(col => {
      const value = record[col];
      return formatValueForSql(value);
    });

    lines.push(`INSERT INTO ${tableName} (${columnList.join(', ')})`);
    lines.push(`  VALUES (${values.join(', ')});`);
    lines.push('');
  }

  return lines.join('\n');
}

// Read schema to determine JSONB columns
function getSchemaInfo(templateName, schemaName) {
  const schemaPath = path.join(__dirname, '../fixtures', templateName, 'describe', `${schemaName}.json`);

  if (!fs.existsSync(schemaPath)) {
    return null;
  }

  try {
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(schemaContent);

    const jsonbColumns = new Set();
    const properties = schema.properties || {};

    for (const [columnName, property] of Object.entries(properties)) {
      if (property.type === 'object') {
        jsonbColumns.add(columnName);
      }
    }

    return { jsonbColumns };
  } catch (error) {
    printWarning(`Could not read schema ${schemaName}: ${error.message}`);
    return null;
  }
}

// Main conversion function
async function convertFixtureData(templateName) {
  if (!templateName) {
    printError('Usage: node scripts/fixtures-convert-data.js <template-name>');
    printError('Example: node scripts/fixtures-convert-data.js basic');
    process.exit(1);
  }

  const fixturesDir = path.join(__dirname, '../fixtures', templateName);
  const dataDir = path.join(fixturesDir, 'data');

  if (!fs.existsSync(dataDir)) {
    printError(`Data directory not found: ${dataDir}`);
    process.exit(1);
  }

  printStep(`Converting data for template: ${templateName}`);

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    printError('No JSON data files found');
    process.exit(1);
  }

  for (const file of files) {
    const jsonPath = path.join(dataDir, file);
    const sqlPath = path.join(dataDir, file.replace('.json', '.sql'));
    const tableName = path.basename(file, '.json');

    printStep(`Converting ${file} → ${path.basename(sqlPath)}`);

    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf8');
      const dataArray = JSON.parse(jsonContent);

      if (!Array.isArray(dataArray)) {
        printError(`${file} does not contain an array`);
        process.exit(1);
      }

      // Get schema info to determine JSONB columns
      const schemaInfo = getSchemaInfo(templateName, tableName);

      const sqlContent = convertDataToSql(dataArray, tableName);

      fs.writeFileSync(sqlPath, sqlContent, 'utf8');

      printSuccess(`Converted ${file} (${dataArray.length} records)`);
    } catch (error) {
      printError(`Failed to convert ${file}: ${error.message}`);
      process.exit(1);
    }
  }

  printSuccess(`Converted ${files.length} data files`);
}

// CLI execution
const templateName = process.argv[2];
convertFixtureData(templateName).catch(error => {
  printError(`Conversion failed: ${error.message}`);
  process.exit(1);
});
