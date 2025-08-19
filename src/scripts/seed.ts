import { db } from '../db/index.js';
import { schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedDatabase() {
  console.log('🌱 Seeding database with metadata schemas...');

  try {
    // Get metadata directory
    const metadataDir = path.join(__dirname, '..', 'metadata');
    const schemaFiles = fs.readdirSync(metadataDir)
      .filter(file => file.endsWith('.yaml'))
      .sort();

    console.log(`Found ${schemaFiles.length} schema files`);

    for (const file of schemaFiles) {
      const filePath = path.join(metadataDir, file);
      const schemaName = path.basename(file, '.yaml');
      
      console.log(`Processing schema: ${schemaName}`);

      // Read and parse YAML
      const yamlContent = fs.readFileSync(filePath, 'utf8');
      const jsonSchema = yaml.load(yamlContent) as any;

      // Check if schema already exists
      const existing = await db.select()
        .from(schema.schemas)
        .where(eq(schema.schemas.name, schemaName))
        .limit(1);

      if (existing.length > 0) {
        console.log(`  Schema '${schemaName}' already exists - skipping`);
        continue;
      }

      // Generate table name (pluralized)
      const tableName = schemaName.endsWith('s') ? `${schemaName}es` : `${schemaName}s`;

      // Create schema record
      await db.insert(schema.schemas).values({
        name: schemaName,
        table_name: tableName,
        status: 'active',
        definition: jsonSchema,
        field_count: Object.keys(jsonSchema.properties || {}).length.toString()
      });

      // Create the actual table
      const baseFields = `
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        domain TEXT,
        access_read UUID[] DEFAULT '{}',
        access_edit UUID[] DEFAULT '{}',
        access_full UUID[] DEFAULT '{}',
        access_deny UUID[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      `;

      // Add schema-specific fields based on JSON Schema
      let schemaFields = '';
      const properties = jsonSchema.properties || {};
      
      for (const [fieldName, fieldDef] of Object.entries(properties) as [string, any][]) {
        if (['id', 'domain', 'access_read', 'access_edit', 'access_full', 'access_deny', 'created_at', 'updated_at'].includes(fieldName)) {
          continue; // Skip base fields
        }

        let sqlType = 'TEXT';
        switch (fieldDef.type) {
          case 'string':
            sqlType = fieldDef.format === 'date-time' ? 'TIMESTAMPTZ' : 'TEXT';
            break;
          case 'number':
            sqlType = 'NUMERIC';
            break;
          case 'integer':
            sqlType = 'INTEGER';
            break;
          case 'boolean':
            sqlType = 'BOOLEAN';
            break;
          case 'array':
            sqlType = 'JSONB';
            break;
          default:
            sqlType = 'JSONB';
        }

        schemaFields += `,\n        ${fieldName} ${sqlType}`;
      }

      const createTableSQL = `
        CREATE TABLE "${tableName}" (
          ${baseFields}${schemaFields}
        )
      `;

      await db.execute(sql.raw(createTableSQL));

      console.log(`  ✓ Created schema '${schemaName}' with table '${tableName}'`);
    }

    console.log('✅ Database seeding completed successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();