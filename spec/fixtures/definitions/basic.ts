/**
 * Basic Fixture Definition
 * 
 * Simple fixture with account and contact schemas for standard testing.
 * Includes realistic data with proper relationships and edge cases.
 */

import { FixtureDefinition } from '@src/lib/fixtures/types.js';

export const basicFixture: FixtureDefinition = {
  name: 'basic',
  description: 'Basic fixture with account and contact schemas for standard testing',
  
  schemas: {
    'account': 'spec/fixtures/schema/account.yaml',
    'contact': 'spec/fixtures/schema/contact.yaml'
    // Note: user schema is managed by tenant initialization, not fixtures
    // Test fixture schemas are located in spec/fixtures/schema/
  },
  
  data_generators: {
    'account': {
      generator: 'AccountGenerator',
      count: 10,
      options: {
        include_edge_cases: true,
        realistic_names: true
      }
    },
    'contact': {
      generator: 'ContactGenerator', 
      count: 20,
      options: {
        include_edge_cases: true,
        realistic_names: true,
        link_to_accounts: true
      }
    },
    // Note: user data is managed by tenant initialization (creates root user)
    // All tests use the built-in root user for now
  },
  
  relationships: [
    {
      from_schema: 'contact',
      from_field: 'account_id',
      to_schema: 'account', 
      to_field: 'id',
      relationship_type: 'many_to_one'
    }
  ],
  
  metadata: {
    total_records: 30, // Will be updated with actual counts during generation
    complexity: 'simple',
    use_cases: [
      'basic_testing', 
      'integration_tests', 
      'observer_validation',
      'relationship_testing',
      'authentication_testing'
    ],
    estimated_build_time_seconds: 5,
    record_counts: {
      'account': 10,
      'contact': 20
      // Note: user records (1 root user) created by tenant initialization, not fixtures
    }
  }
};