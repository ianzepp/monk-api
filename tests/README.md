# Monk API Test Structure

## Numbered Test Organization (00-99)

Tests are organized using a numerical prefix system to create a logical hierarchy from basic to complex functionality.

### Test Ranges

#### 00-09: Setup and Infrastructure (Reserved)
- **Purpose**: Database setup, migrations, initial configuration
- **Characteristics**: Foundational tests that prepare the environment
- **Currently**: Reserved for future database setup tests

#### 10-19: Connection and Authentication
- **Purpose**: Basic connectivity, auth, ping tests
- **Characteristics**: Core functionality that everything else depends on
- **Tests**:
  - `10-connection/ping-test.sh` - Basic server connectivity and auth

#### 20-29: Meta API
- **Purpose**: Schema management and metadata operations
- **Characteristics**: API endpoint availability and basic operations
- **Tests**:
  - `20-meta-api/basic-meta-endpoints.sh` - Basic endpoint availability
  - `20-meta-api/schema-create-and-delete.sh` - Schema CRUD operations

#### 30-39: Data API
- **Purpose**: Data operations and basic CRUD
- **Characteristics**: API endpoint availability without complex schemas
- **Tests**:
  - `30-data-api/basic-data-endpoints.sh` - Basic endpoint error handling

#### 40-49: Reserved for Expansion
- **Purpose**: Future basic API tests
- **Currently**: Available for additional basic functionality tests

#### 50-59: Integration Tests
- **Purpose**: Multi-component workflows and end-to-end scenarios
- **Characteristics**: Complex workflows that test multiple APIs together
- **Tests**:
  - `50-integration/test-pipeline.sh` - Complete workflow pipeline

#### 60-69: Lifecycle Tests
- **Purpose**: Complete CRUD lifecycles and data management
- **Characteristics**: Full record lifecycle from creation to deletion
- **Tests**:
  - `60-lifecycle/record-lifecycle-test.sh` - Complete record CRUD operations

#### 70-79: Validation and Constraints
- **Purpose**: Schema validation, constraints, and business rules
- **Characteristics**: Complex validation scenarios and constraint testing
- **Tests**:
  - `70-validation/schema-restrict-test.sh` - Foreign key restrictions
  - `70-validation/schema-validations-change.sh` - Dynamic validation changes

#### 80-89: Performance and Load (Reserved)
- **Purpose**: Performance testing, load testing, stress testing
- **Currently**: Reserved for future performance tests

#### 90-99: Error Handling and Edge Cases (Reserved)
- **Purpose**: Error scenarios, edge cases, security testing
- **Currently**: Reserved for comprehensive error testing

## Running Tests

### Individual Test Categories
```bash
npm run test:connection      # 10-19: Connection tests
npm run test:meta-basic      # 20-29: Basic meta API
npm run test:data-basic      # 30-39: Basic data API
npm run test:schema          # 20-29: Schema operations
npm run test:lifecycle       # 60-69: Record lifecycle
npm run test:pipeline        # 50-59: Integration pipeline
npm run test:validation      # 70-79: Validation tests
npm run test:restrictions    # 70-79: Constraint tests
```

### Comprehensive Test Suite
```bash
# Run all tests in numerical order
./tests/run-all-tests.sh

# Or use the main test script
npm run test
```

## Adding New Tests

### Naming Convention
- Use appropriate numerical prefix based on complexity
- Use descriptive names: `[number]-[category]/[test-name].sh`
- Make scripts executable: `chmod +x test-script.sh`

### Test Structure
- Include proper error handling (`set -e`)
- Use consistent output formatting (colors, step messages)
- Source shared utilities when needed
- Clean up after test completion

### Examples
```bash
# Basic API test (20-29 range)
tests/25-meta-api/schema-validation-test.sh

# Complex integration test (50-59 range)  
tests/55-integration/multi-tenant-workflow.sh

# Error handling test (90-99 range)
tests/95-errors/malformed-request-handling.sh
```

## Test Dependencies

Tests are designed to run independently, but there's a logical dependency order:

1. **Connection (10-19)** - Must work for all other tests
2. **Basic APIs (20-39)** - API availability
3. **Integration (50-59)** - Multi-API workflows
4. **Lifecycle (60-69)** - Complete data operations
5. **Validation (70-79)** - Complex constraint testing

The comprehensive test runner (`run-all-tests.sh`) executes tests in this optimal order.