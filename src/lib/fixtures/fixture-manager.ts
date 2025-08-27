/**
 * FixtureManager - Manages fixture definitions and template building
 * 
 * Loads fixture definitions, coordinates data generators, and builds
 * template databases with realistic data and proper relationships.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '@src/lib/logger.js';
import { MonkEnv } from '@src/lib/monk-env.js';
import type { FixtureDefinition, FixtureData, DataGeneratorConfig, GeneratorContext, IDataGenerator } from '@src/lib/fixtures/types.js';
import type { TenantInfo } from '@src/lib/services/tenant.js';

export class FixtureManager {
  
  /**
   * Load fixture definition from TypeScript file
   */
  static async loadFixtureDefinition(name: string): Promise<FixtureDefinition> {
    try {
      const definitionPath = join(process.cwd(), `spec/fixtures/definitions/${name}.ts`);
      
      if (!existsSync(definitionPath)) {
        throw new Error(`Fixture definition not found: ${definitionPath}`);
      }
      
      // Dynamic import for ESM modules
      const module = await import(`file://${definitionPath}`);
      const fixtureKey = `${name}Fixture`;
      
      if (!module[fixtureKey]) {
        throw new Error(`Fixture definition '${fixtureKey}' not found in ${definitionPath}`);
      }
      
      return module[fixtureKey] as FixtureDefinition;
    } catch (error) {
      throw new Error(`Failed to load fixture definition '${name}': ${error}`);
    }
  }
  
  /**
   * Build fixture data by coordinating data generators
   */
  static async buildFixtureData(fixture: FixtureDefinition): Promise<FixtureData> {
    console.log(`🏗️  Building fixture data: ${fixture.name}`);
    
    // Load and validate all schemas
    const schemas = await this.loadSchemas(fixture.schemas);
    
    // Build generator dependency graph
    const generationOrder = await this.buildGenerationOrder(fixture.data_generators);
    console.log(`📋 Generation order: ${generationOrder.join(' → ')}`);
    
    // Generate data in dependency order
    const data: Record<string, any[]> = {};
    
    for (const schemaName of generationOrder) {
      const generatorConfig = fixture.data_generators[schemaName];
      
      if (!generatorConfig) {
        throw new Error(`No generator configuration found for schema: ${schemaName}`);
      }
      
      console.log(`🎲 Generating ${generatorConfig.count} records for ${schemaName}...`);
      
      // Build generator context
      const context: GeneratorContext = {
        schemaName,
        allSchemas: schemas,
        existingData: data,
        relationships: fixture.relationships,
        options: generatorConfig.options
      };
      
      // Load and execute generator
      const generator = await this.loadGenerator(generatorConfig.generator);
      const records = generator.generate(generatorConfig.count, generatorConfig.options, context);
      
      // Validate generated records
      if (generator.validate) {
        const validation = generator.validate(records, generatorConfig.options);
        if (!validation.isValid) {
          throw new Error(`Generated data validation failed for ${schemaName}: ${validation.errors.join(', ')}`);
        }
        
        if (validation.warnings.length > 0) {
          logger.warn('Generator validation warnings', { 
            schemaName, 
            warnings: validation.warnings 
          });
        }
      }
      
      data[schemaName] = records;
      console.log(`✅ Generated ${records.length} ${schemaName} records`);
    }
    
    // Calculate actual record counts
    const recordCounts: Record<string, number> = {};
    Object.entries(data).forEach(([schema, records]) => {
      recordCounts[schema] = records.length;
    });
    
    const totalRecords = Object.values(recordCounts).reduce((sum, count) => sum + count, 0);
    
    console.log(`✅ Fixture data built: ${totalRecords} total records across ${Object.keys(data).length} schemas`);
    
    return {
      schemas,
      data,
      relationships: fixture.relationships,
      metadata: {
        ...fixture.metadata,
        total_records: totalRecords,
        record_counts: recordCounts
      }
    };
  }
  
  /**
   * Build template database using System/Database/Metabase classes
   */
  static async buildTemplateWithData(
    templateName: string,
    fixtureData: FixtureData,
    tenantInfo: TenantInfo,
    useSafeMigration: boolean = true
  ): Promise<void> {
    console.log(`🔨 Building template with data: ${templateName}`);
    
    // Import System/Database classes and ObserverLoader dynamically to avoid circular dependencies
    const { System } = await import('../system.js');
    const { DatabaseConnection } = await import('../database-connection.js');
    const { ObserverLoader } = await import('../observers/loader.js');
    
    // Preload observers for database operations
    console.log('🔧 Preloading observers for template building...');
    await ObserverLoader.preloadObservers();
    
    // Create mock context for template operations
    const mockContext = this.createMockContext(tenantInfo);
    
    // Set up database context
    DatabaseConnection.setDatabaseForRequest(mockContext as any, tenantInfo.database);
    
    const system = new System(mockContext as any);
    const database = system.database;
    const metabase = system.metabase;
    
    // Load schemas into metabase
    console.log(`📋 Loading ${Object.keys(fixtureData.schemas).length} schemas...`);
    for (const [schemaName, schemaContent] of Object.entries(fixtureData.schemas)) {
      await metabase.createOne(schemaName, schemaContent);
      console.log(`✅ Schema loaded: ${schemaName}`);
    }
    
    // Load data into database
    console.log(`💾 Loading data into template database...`);
    
    if (useSafeMigration) {
      // Use safe migration (observer pipeline) for validation
      for (const [schemaName, records] of Object.entries(fixtureData.data)) {
        if (records.length > 0) {
          console.log(`📝 Loading ${records.length} ${schemaName} records (with observer pipeline)...`);
          await database.createAll(schemaName, records);
          console.log(`✅ ${schemaName} data loaded`);
        }
      }
    } else {
      // Unsafe migration - direct SQL for speed (future enhancement)
      console.log(`⚡ Using direct SQL loading (unsafe mode)`);
      // TODO: Implement direct SQL loading for large datasets
      throw new Error('Unsafe migration mode not yet implemented');
    }
    
    console.log(`✅ Template database built with ${fixtureData.metadata.total_records} records`);
  }
  
  /**
   * Load schemas from YAML files
   */
  private static async loadSchemas(schemaPaths: Record<string, string>): Promise<Record<string, string>> {
    const schemas: Record<string, string> = {};
    
    for (const [schemaName, schemaPath] of Object.entries(schemaPaths)) {
      if (!existsSync(schemaPath)) {
        throw new Error(`Schema file not found: ${schemaPath}`);
      }
      
      try {
        schemas[schemaName] = readFileSync(schemaPath, 'utf-8');
      } catch (error) {
        throw new Error(`Failed to read schema file ${schemaPath}: ${error}`);
      }
    }
    
    return schemas;
  }
  
  /**
   * Build generation order respecting dependencies
   */
  private static async buildGenerationOrder(generators: Record<string, DataGeneratorConfig>): Promise<string[]> {
    const dependencies: Record<string, string[]> = {};
    const schemas = Object.keys(generators);
    
    // Get dependencies for each generator
    for (const [schemaName, config] of Object.entries(generators)) {
      try {
        const generator = await this.loadGenerator(config.generator);
        dependencies[schemaName] = generator.getDependencies ? generator.getDependencies() : [];
      } catch (error) {
        logger.warn('Could not load generator dependencies', { schemaName, error: String(error) });
        dependencies[schemaName] = [];
      }
    }
    
    // Topological sort to determine generation order
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (schema: string) => {
      if (visiting.has(schema)) {
        throw new Error(`Circular dependency detected involving: ${schema}`);
      }
      
      if (visited.has(schema)) {
        return;
      }
      
      visiting.add(schema);
      
      const deps = dependencies[schema] || [];
      for (const dep of deps) {
        if (schemas.includes(dep)) {
          visit(dep);
        }
      }
      
      visiting.delete(schema);
      visited.add(schema);
      order.push(schema);
    };
    
    for (const schema of schemas) {
      visit(schema);
    }
    
    return order;
  }
  
  /**
   * Load data generator class dynamically
   */
  private static async loadGenerator(generatorName: string): Promise<IDataGenerator> {
    try {
      // Convert generator name to file path (e.g., 'AccountGenerator' → 'account-generator')
      const fileName = generatorName
        .replace(/Generator$/, '')
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .substring(1) + '-generator';
      
      const generatorPath = join(process.cwd(), `spec/fixtures/generators/${fileName}.ts`);
      
      if (!existsSync(generatorPath)) {
        throw new Error(`Generator file not found: ${generatorPath}`);
      }
      
      // Dynamic import for ESM modules
      const module = await import(`file://${generatorPath}`);
      
      if (!module[generatorName]) {
        throw new Error(`Generator class '${generatorName}' not found in ${generatorPath}`);
      }
      
      const GeneratorClass = module[generatorName];
      return new GeneratorClass();
    } catch (error) {
      throw new Error(`Failed to load generator '${generatorName}': ${error}`);
    }
  }
  
  /**
   * Create mock Hono context for template operations
   */
  private static createMockContext(tenantInfo: TenantInfo): any {
    return {
      env: {
        JWT_SECRET: MonkEnv.get('JWT_SECRET', 'template-secret'),
        DATABASE_URL: MonkEnv.get('DATABASE_URL', undefined, true),
      },
      req: {
        header: (name: string) => {
          if (name === 'x-request-id') {
            return `template-${Date.now()}`;
          }
          return undefined;
        }
      },
      contextData: new Map(),
      get: function(key: string) {
        return this.contextData.get(key);
      },
      set: function(key: string, value: any) {
        this.contextData.set(key, value);
      }
    };
  }
}