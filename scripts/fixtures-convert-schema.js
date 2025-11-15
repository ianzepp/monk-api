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

// Map JSON Schema type to PostgreSQL column_type
function mapJsonTypeToColumnType(property) {
  const { type, format } = property;

  if (type === 'string') {
    if (format === 'date-time') return 'timestamp';
    return 'text';
  }
  if (type === 'number') return 'numeric';
  if (type === 'integer') return 'integer';
  if (type === 'boolean') return 'boolean';
  if (type === 'object') return 'jsonb';
  if (type === 'array') {
    // Handle array types
    const itemsType = property.items?.type;
    if (itemsType === 'string') return 'text[]';
    if (itemsType === 'integer') return 'integer[]';
    if (itemsType === 'number') return 'numeric[]';
    return 'text[]'; // fallback
  }

  return 'text'; // fallback
}

// Escape SQL string values
function escapeSqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Format array for PostgreSQL
function formatArrayForSql(arr) {
  if (!arr || arr.length === 0) return 'NULL';
  const escaped = arr.map(v => escapeSqlString(v).slice(1, -1)); // Remove outer quotes
  return `ARRAY[${escaped.map(v => `'${v}'`).join(', ')}]`;
}

// Convert JSON Schema to SQL INSERT statements
function convertSchemaToSql(jsonSchema, schemaName) {
  const lines = [];

  lines.push('-- Schema definition for ' + schemaName);
  lines.push('-- Generated from JSON Schema format');
  lines.push('');

  // Insert into schemas table
  lines.push('-- Insert schema record');
  lines.push(`INSERT INTO schemas (schema_name, status) VALUES ('${schemaName}', 'active');`);
  lines.push('');

  // Insert into columns table for each property
  lines.push('-- Insert column definitions');

  const properties = jsonSchema.properties || {};
  const required = jsonSchema.required || [];

  for (const [columnName, property] of Object.entries(properties)) {
    const columnType = mapJsonTypeToColumnType(property);
    const isRequired = required.includes(columnName) ? 'true' : 'false';
    const description = property.description || null;
    const defaultValue = property.default !== undefined ? String(property.default) : null;
    const minimum = property.minimum !== undefined ? property.minimum : (property.minLength !== undefined ? property.minLength : null);
    const maximum = property.maximum !== undefined ? property.maximum : (property.maxLength !== undefined ? property.maxLength : null);
    const pattern = property.pattern || null;
    const enumValues = property.enum || null;

    // Build INSERT statement
    const columns = ['schema_name', 'column_name', 'type', 'required'];
    const values = [
      escapeSqlString(schemaName),
      escapeSqlString(columnName),
      escapeSqlString(columnType),
      escapeSqlString(isRequired)
    ];

    if (defaultValue !== null) {
      columns.push('default_value');
      values.push(escapeSqlString(defaultValue));
    }

    if (description !== null) {
      columns.push('description');
      values.push(escapeSqlString(description));
    }

    if (minimum !== null) {
      columns.push('minimum');
      values.push(minimum);
    }

    if (maximum !== null) {
      columns.push('maximum');
      values.push(maximum);
    }

    if (pattern !== null) {
      columns.push('pattern');
      values.push(escapeSqlString(pattern));
    }

    if (enumValues !== null) {
      columns.push('enum_values');
      values.push(formatArrayForSql(enumValues));
    }

    lines.push(`INSERT INTO columns (${columns.join(', ')})`);
    lines.push(`  VALUES (${values.join(', ')});`);
    lines.push('');
  }

  // Call the utility function to create the table from schema/columns metadata
  lines.push('-- Create the actual table from schema definition');
  lines.push(`SELECT create_table_from_schema('${schemaName}');`);
  lines.push('');

  return lines.join('\n');
}

// Main conversion function
async function convertFixtureSchemas(templateName) {
  if (!templateName) {
    printError('Usage: node scripts/fixtures-convert-schema.js <template-name>');
    printError('Example: node scripts/fixtures-convert-schema.js testing');
    process.exit(1);
  }

  const fixturesDir = path.join(__dirname, '../fixtures', templateName);
  const describeDir = path.join(fixturesDir, 'describe');

  if (!fs.existsSync(describeDir)) {
    printError(`Describe directory not found: ${describeDir}`);
    process.exit(1);
  }

  printStep(`Converting schemas for template: ${templateName}`);

  const files = fs.readdirSync(describeDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    printError('No JSON schema files found');
    process.exit(1);
  }

  for (const file of files) {
    const jsonPath = path.join(describeDir, file);
    const sqlPath = path.join(describeDir, file.replace('.json', '.sql'));
    const schemaName = path.basename(file, '.json');

    printStep(`Converting ${file} → ${path.basename(sqlPath)}`);

    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf8');
      const jsonSchema = JSON.parse(jsonContent);

      const sqlContent = convertSchemaToSql(jsonSchema, schemaName);

      fs.writeFileSync(sqlPath, sqlContent, 'utf8');

      printSuccess(`Converted ${file}`);
    } catch (error) {
      printError(`Failed to convert ${file}: ${error.message}`);
      process.exit(1);
    }
  }

  printSuccess(`Converted ${files.length} schema files`);
}

// CLI execution
const templateName = process.argv[2];
convertFixtureSchemas(templateName).catch(error => {
  printError(`Conversion failed: ${error.message}`);
  process.exit(1);
});
