/**
 * Basic Large Fixture Definition
 * 
 * Large-scale version of the basic fixture with 100x larger datasets.
 * Uses identical schemas as basic fixture but generates substantial data
 * for performance testing, stress testing, and large dataset validation.
 */

import { FixtureDefinition } from '@src/lib/fixtures/types.js';

export const BasicLargeFixture: FixtureDefinition = {
  name: 'basic-large',
  description: 'Large-scale basic fixture for performance testing with 100x datasets',
  
  schemas: {
    'account': 'spec/fixtures/schema/account.yaml',
    'contact': 'spec/fixtures/schema/contact.yaml'
  },
  
  data_generators: {
    'account': {
      generator: 'AccountGenerator',
      count: 1500, // 100x larger than basic (15 × 100)
      options: {
        include_edge_cases: true,
        realistic_names: true,
        varied_distributions: true, // Ensure variety across large dataset
        seed_random: 42 // Deterministic for reproducible performance tests
      }
    },
    'contact': {
      generator: 'ContactGenerator', 
      count: 2500, // 100x larger than basic (25 × 100)
      options: {
        include_edge_cases: true,
        realistic_names: true,
        link_to_accounts: true, // Maintain 70% relationship rate
        varied_distributions: true,
        seed_random: 42 // Consistent with accounts
      }
    }
  },
  
  relationships: [
    {
      from_schema: 'contact',
      from_field: 'account_id',
      to_schema: 'account', 
      to_field: 'id',
      relationship_type: 'many_to_one',
      coverage_percentage: 70 // 70% of contacts linked to accounts
    }
  ],
  
  metadata: {
    total_records: 4000, // 1500 accounts + 2500 contacts
    complexity: 'large',
    use_cases: [
      'performance_testing',
      'stress_testing', 
      'large_dataset_validation',
      'filter_system_benchmarking',
      'observer_pipeline_load_testing',
      'query_optimization_testing',
      'memory_usage_profiling',
      'ci_cd_performance_baseline'
    ],
    estimated_build_time_seconds: 300, // ~5 minutes for large dataset
    estimated_template_size_mb: 750, // ~750MB estimated
    record_counts: {
      'account': 1500,
      'contact': 2500
    },
    performance_targets: {
      max_build_time_minutes: 10,
      max_clone_time_seconds: 2,
      max_template_size_gb: 1
    },
    resource_requirements: {
      min_memory_mb: 512,
      min_disk_space_gb: 2, // For template + cloning
      postgresql_version: '12+'
    }
  }
};

// Export as default for fixture loading system
export default BasicLargeFixture;