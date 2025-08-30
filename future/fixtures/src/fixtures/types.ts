/**
 * Fixture Definition Types
 * 
 * Type definitions for the fixture system that creates realistic test data
 * and builds template databases with proper relationships.
 */

export interface FixtureDefinition {
  name: string;
  description: string;
  schemas: Record<string, string>;           // schema name → file path
  data_generators: Record<string, DataGeneratorConfig>;
  relationships: FixtureRelationship[];
  metadata: FixtureMetadata;
}

export interface DataGeneratorConfig {
  generator: string;                        // Generator class name (e.g., 'AccountGenerator')
  count: number;                           // Number of records to generate
  options: DataGeneratorOptions;           // Generator-specific options
}

export interface DataGeneratorOptions {
  include_edge_cases?: boolean;            // Add boundary conditions and edge cases
  realistic_names?: boolean;               // Use realistic names vs generic ones
  link_to_accounts?: boolean;              // Create relationships to account records
  link_to_categories?: boolean;            // Create relationships to category records
  link_to_orders_and_products?: boolean;   // Create cross-schema relationships
  hierarchical?: boolean;                  // Create hierarchical data structure
  realistic_dates?: boolean;               // Generate realistic date ranges
  [key: string]: any;                      // Allow additional generator-specific options
}

export interface FixtureRelationship {
  from_schema: string;                     // Source schema name
  from_field: string;                      // Source field name
  to_schema: string;                       // Target schema name
  to_field: string;                        // Target field name
  relationship_type: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
}

export interface FixtureMetadata {
  total_records: number;                   // Total number of records across all schemas
  complexity: 'simple' | 'medium' | 'complex';
  use_cases: string[];                     // Test scenarios this fixture supports
  estimated_build_time_seconds: number;    // Expected time to build template
  record_counts: Record<string, number>;   // Records per schema
}

export interface FixtureData {
  schemas: Record<string, any>;            // Schema name → schema definition
  data: Record<string, any[]>;             // Schema name → array of records
  relationships: FixtureRelationship[];    // Relationship definitions
  metadata: FixtureMetadata;               // Fixture metadata
}

export interface GeneratedRecord {
  [key: string]: any;                      // Flexible record structure
}

export interface GeneratorContext {
  schemaName: string;                      // Current schema being generated
  allSchemas: Record<string, any>;         // All schemas in fixture
  existingData: Record<string, any[]>;     // Previously generated data for relationships
  relationships: FixtureRelationship[];    // All relationships in fixture
  options: DataGeneratorOptions;           // Generator configuration
}

export interface ValidationResult {
  isValid: boolean;                        // Overall validation result
  errors: string[];                        // Validation error messages
  warnings: string[];                      // Non-critical warnings
  recordCounts: Record<string, number>;    // Actual vs expected record counts
}

/**
 * Base interface for data generators
 */
export interface IDataGenerator {
  /**
   * Generate records for a schema
   */
  generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[];
  
  /**
   * Validate generated data meets requirements
   */
  validate?(records: GeneratedRecord[], options: DataGeneratorOptions): ValidationResult;
  
  /**
   * Get dependencies (schemas that must be generated first)
   */
  getDependencies?(): string[];
}