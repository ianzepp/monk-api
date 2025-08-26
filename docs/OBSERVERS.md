# Observer System Development Guide

## Table of Contents
1. [Observer Architecture](#observer-architecture)
2. [Ring System](#ring-system)
3. [Creating Observers](#creating-observers)
4. [Async Observers](#async-observers)
5. [Performance Profiling](#performance-profiling)
6. [Observer Patterns](#observer-patterns)
7. [Testing Observers](#testing-observers)
8. [Data Integrity Pipeline](#data-integrity-pipeline)

## Observer Architecture

The Observer system provides **universal business logic execution** through a ring-based pipeline that automatically runs for every database operation. This ensures consistent validation, security, audit, and integration without touching core database code.

### Core Components

#### **ObserverRunner** (`src/lib/observers/observer-runner.ts`)
- **Ring-Based Execution**: 10 ordered rings (0-9) with selective execution per operation type
- **File-Based Discovery**: Auto-loads observers from `src/observers/schema/ring/observer.ts`
- **Universal Coverage**: All database operations automatically run through observer pipeline
- **Schema Integration**: Provides Schema objects with validation capabilities to all observers

#### **BaseObserver Pattern** (`src/lib/observers/base-observer.ts`)
- **executeTry/execute separation**: Comprehensive error handling with pure business logic
- **Schema Context**: Access to full Schema objects with `schema.validateOrThrow()` and `schema.isSystemSchema()`
- **Consistent Logging**: Built-in timing and execution tracking
- **Error Classification**: ValidationError, BusinessLogicError, SystemError for proper handling

#### **BaseAsyncObserver** (`src/lib/observers/base-async-observer.ts`)
- **Non-blocking execution**: Perfect for external APIs, notifications, cache invalidation
- **Error isolation**: Failures logged but don't affect committed database operations
- **Timeout protection**: 10s default timeout for external service operations
- **Transaction safety**: Executes outside transaction context after commit

## Ring System

The observer system executes business logic in **10 ordered rings (0-9)** for every database operation:

```typescript
// Ring allocation and execution order
Ring 0: DataPreparation // Data loading, merging, input preparation
Ring 1: InputValidation // Schema validation, format checks, basic integrity
Ring 2: Security        // Access control, protection policies, rate limiting
Ring 3: Business        // Complex business logic, domain rules, workflows
Ring 4: Enrichment      // Data enrichment, defaults, computed fields
Ring 5: Database        // 🎯 SQL EXECUTION (SqlObserver)
Ring 6: PostDatabase    // Immediate post-database processing
Ring 7: Audit           // Audit logging, change tracking, compliance
Ring 8: Integration     // External APIs, webhooks, cache invalidation (async)
Ring 9: Notification    // User notifications, email alerts, real-time updates (async)
```

### Ring Selection Guidelines

#### **Synchronous Rings (0-5): Blocking Execution**
- **Ring 0 (DataPreparation)**: Record preloading, data merging, input sanitization
- **Ring 1 (InputValidation)**: JSON Schema validation, required field checks, format validation
- **Ring 2 (Security)**: Access control, soft delete protection, existence validation
- **Ring 3 (Business)**: Complex business rules, domain validation, workflow logic
- **Ring 4 (Enrichment)**: Computed fields, default values, data transformation
- **Ring 5 (Database)**: SQL execution only - handled by SqlObserver

#### **Asynchronous Rings (6-9): Non-blocking Execution**
- **Ring 6 (PostDatabase)**: Immediate post-processing that doesn't need external calls
- **Ring 7 (Audit)**: Change tracking, compliance logging (can be async for performance)
- **Ring 8 (Integration)**: External APIs, webhooks, cache clearing, search indexing
- **Ring 9 (Notification)**: Email, push notifications, real-time updates

## Creating Observers

### File Organization
```
src/observers/:schema/:ring/:observer-name.ts

Examples:
src/observers/all/0/record-preloader.ts        # Ring 0: All schemas, data preparation
src/observers/all/1/json-schema-validator.ts   # Ring 1: All schemas, validation
src/observers/users/1/email-validation.ts      # Ring 1: Users schema only
src/observers/all/7/change-tracker.ts          # Ring 7: All schemas, audit
src/observers/all/8/webhook-sender.ts          # Ring 8: All schemas, async integration
```

### Schema Targeting
- **Specific schema**: `src/observers/users/` → Only applies to "users" schema
- **All schemas**: `src/observers/all/` → Applies to every schema
- **Auto-discovery**: Observer system loads all observers at server startup

### Basic Observer Pattern

```typescript
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/observer-ring.js';
import { ValidationError } from '@src/lib/errors.js';
import type { ObserverContext } from '@src/lib/observers/observer-context.js';

export default class CustomValidator extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        const { system, schema, schemaName, data, metadata } = context;
        
        // Use preloaded data from RecordPreloader (Ring 0) for efficiency
        const existingRecords = RecordPreloader.getPreloadedRecords(context);
        
        for (const record of data) {
            // Access Schema object for validation
            schema.validateOrThrow(record);
            
            if (!this.isValid(record)) {
                throw new ValidationError('Invalid data', 'field');
            }
        }
        
        // Record validation metadata for audit
        metadata.set('custom_validation', 'passed');
        logger.info('Custom validation completed', { schemaName, recordCount: data.length });
    }
    
    private isValid(record: any): boolean {
        // Custom validation logic
        return true;
    }
}
```

### Observer Context

The `ObserverContext` provides complete access to the operation:

```typescript
interface ObserverContext {
    system: SystemContext;           // Database, tenant, user context
    schema: Schema;                  // Full Schema object with validation
    schemaName: string;              // Schema name for logging
    operation: DatabaseOperation;    // create, update, delete, revert, select
    data: any[];                     // Array of records being processed
    metadata: Map<string, any>;      // Cross-observer communication
    result?: any[];                  // Available in post-database rings
    isSelectOperation: boolean;      // Helper for read vs write operations
}
```

## Async Observers

For operations that don't need to block the API response (external APIs, notifications, cache invalidation):

```typescript
import { BaseAsyncObserver } from '@src/lib/observers/base-async-observer.js';

export default class WebhookSender extends BaseAsyncObserver {
    ring = ObserverRing.Integration;
    operations = ['create', 'update', 'delete'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        const { operation, schemaName, result } = context;
        
        // This executes asynchronously after database commit
        // Failures are logged but don't affect the API response
        try {
            await this.sendWebhook({
                event: `${schemaName}.${operation}`,
                data: result,
                timestamp: new Date()
            });
        } catch (error) {
            // Error logged automatically by BaseAsyncObserver
            // API response already sent successfully
        }
    }
    
    private async sendWebhook(payload: any): Promise<void> {
        // External webhook implementation
    }
}
```

### Async Observer Benefits
- ✅ **Faster responses**: External operations don't block API response
- ✅ **Error isolation**: Async failures logged via logger.warn(), don't affect committed data
- ✅ **Timeout protection**: 10s default timeout for external service operations
- ✅ **Transaction safety**: Executes outside transaction context after commit

## Performance Profiling

### Automatic Performance Monitoring

All observers are automatically tracked with nanosecond precision:

```
[TIME] Observer: JsonSchemaValidator 23.527ms { ring: 1, operation: "create" }
[TIME] AsyncObserver: WebhookSender 156.789ms { ring: 8, status: "success" }
```

### Profiling Output Examples
```
[TIME] Observer: RecordPreloader 1.291ms { ring: 0, operation: "update", schemaName: "users", status: "success" }
[TIME] Observer: JsonSchemaValidator 0.090ms { ring: 1, operation: "update", schemaName: "users", status: "success" }
[TIME] Observer: SqlObserver 3.257ms { ring: 5, operation: "update", schemaName: "users", status: "success" }
[TIME] AsyncObserver: CacheInvalidator 1.625ms { ring: 8, operation: "update", status: "success" }
```

### Performance Analysis Capabilities
- **Bottleneck identification**: Immediately see which observers are slow
- **Ring performance**: Understand time distribution across observer rings
- **Schema compilation caching**: See JsonSchemaValidator performance improve with caching
- **Database efficiency**: Monitor SQL operation timing and optimization opportunities

## Observer Patterns

### Data Preparation Pattern (Ring 0)

```typescript
export default class RecordPreloader extends BaseObserver {
    ring = ObserverRing.DataPreparation;
    operations = ['update', 'delete', 'revert'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        const { system, schemaName, data } = context;
        
        // Preload existing records for efficient access by other observers
        const ids = data.map(record => record.id).filter(Boolean);
        if (ids.length === 0) return;
        
        const existingRecords = await system.database.selectAny(schemaName, {
            where: { id: { $in: ids } }
        });
        
        // Store in context for other observers to use
        context.metadata.set('preloaded_records', Object.freeze(existingRecords));
    }
}
```

### Validation Pattern (Ring 1)

```typescript
export default class JsonSchemaValidator extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        const { schema, data } = context;
        
        for (const record of data) {
            // Use Schema object's built-in validation
            schema.validateOrThrow(record);
        }
    }
}
```

### Security Pattern (Ring 2)

```typescript
export default class SoftDeleteProtector extends BaseObserver {
    ring = ObserverRing.Security;
    operations = ['update', 'delete'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        const preloadedRecords = context.metadata.get('preloaded_records') || [];
        
        for (const record of preloadedRecords) {
            if (record.trashed_at || record.deleted_at) {
                throw new SecurityError(`Cannot modify ${record.trashed_at ? 'trashed' : 'deleted'} record`);
            }
        }
    }
}
```

## Testing Observers

### Unit Testing (No Database)

```typescript
// spec/unit/observers/custom-validator.test.ts
import { describe, test, expect } from 'vitest';
import CustomValidator from '@src/observers/users/1/custom-validator.js';
import { createMockObserverContext } from '@spec/helpers/observer-helpers.js';

describe('CustomValidator Observer', () => {
    test('should validate user data correctly', async () => {
        const observer = new CustomValidator();
        const context = createMockObserverContext({
            schemaName: 'users',
            operation: 'create',
            data: [{ email: 'test@example.com' }]
        });
        
        await expect(observer.execute(context)).resolves.not.toThrow();
    });
    
    test('should throw ValidationError for invalid data', async () => {
        const observer = new CustomValidator();
        const context = createMockObserverContext({
            schemaName: 'users',
            operation: 'create',
            data: [{ email: 'invalid-email' }]
        });
        
        await expect(observer.execute(context)).rejects.toThrow(ValidationError);
    });
});
```

### Integration Testing (With Database)

```typescript
// spec/integration/observers/observer-pipeline.test.ts
import { describe, test, expect, beforeAll } from 'vitest';
import { createTestContextWithFixture } from '@spec/helpers/test-tenant.js';

describe('Observer Pipeline Integration', () => {
    let testContext: TestContextWithData;

    beforeAll(async () => {
        testContext = await createTestContextWithFixture('basic');
    });

    test('should run complete observer pipeline for user creation', async () => {
        const result = await testContext.database.createOne('users', {
            email: 'test@example.com',
            name: 'Test User'
        });
        
        // Verify all observers ran successfully
        expect(result.id).toBeDefined();
        expect(result.created_at).toBeDefined();
    });
});
```

## Data Integrity Pipeline

### Complete Phase 1+2 Implementation (Issue #101)

The data integrity observer pipeline provides universal protection for all database operations:

#### **Phase 1: Schema Validation (Ring 0-1)**
- **SystemSchemaProtector**: Prevents data operations on system schemas
- **JsonSchemaValidator**: Validates all data against JSON Schema definitions
- **29 unit tests** covering schema protection and validation workflows

#### **Phase 2: Data Integrity & Business Logic (Rings 0-2)**
- **RecordPreloader** (Ring 0): Efficient single-query preloading of existing records
- **UpdateMerger** (Ring 0): Proper record merging preserving unchanged fields
- **SoftDeleteProtector** (Ring 2): Prevents operations on trashed/deleted records
- **ExistenceValidator** (Ring 2): Validates records exist before operations
- **131 unit tests total** covering complete data integrity pipeline

#### **Universal Coverage & Performance**
- **All schemas protected**: Every database operation gets validation, security, business logic automatically
- **Single query preloading**: O(1) vs O(N) database calls for multi-record operations
- **Read-only safety**: Frozen preloaded objects prevent accidental mutation
- **Clean SQL transport**: SqlObserver (Ring 5) handles pure database operations after validation

## Observer Development Workflow

### 1. Create Observer File
```bash
# Create observer in appropriate directory
src/observers/users/0/custom-validation.ts     # User schema, validation ring
src/observers/all/7/audit-logger.ts            # All schemas, audit ring
```

### 2. Implement Observer Class
```typescript
export default class CustomObserver extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        // Implementation
    }
}
```

### 3. Test Observer
```bash
# Unit test the observer logic
npm run spec:one spec/unit/observers/custom-observer.test.ts

# Integration test with database
npm run spec:one spec/integration/observer-pipeline.test.ts
```

### 4. Verify Auto-Loading
```bash
# Observer system loads new observer automatically
npm run start:dev

# Look for observer loading logs:
# "✅ Observer loaded: CustomObserver (ring 1, schema users)"
```

### 5. Test in Pipeline
```bash
# Test complete observer pipeline
npm run spec:sh spec/85-observer-integration/observer-startup-test.sh
```

## Best Practices

### Observer Design
- **Single Responsibility**: Each observer should have one clear purpose
- **Ring Appropriateness**: Choose the right ring for your observer's function
- **Error Handling**: Use appropriate error types (ValidationError, BusinessLogicError, SystemError)
- **Performance**: Use preloaded data when possible, avoid N+1 queries
- **Logging**: Include relevant context in log messages

### Schema Integration
- **Use Schema Objects**: Access `context.schema.validateOrThrow()` for validation
- **System Schema Check**: Use `context.schema.isSystemSchema()` for protection
- **Schema Context**: Leverage schema information for business logic decisions

### Testing Strategy
- **Unit Tests First**: Test observer logic without database dependencies
- **Integration Tests**: Verify observers work in complete pipeline
- **Mock Context**: Use `createMockObserverContext()` for isolated testing
- **Real Database**: Use `createTestContextWithFixture()` for integration tests

### Performance Optimization
- **Preloading**: Use RecordPreloader results to avoid duplicate queries
- **Batch Operations**: Process multiple records efficiently
- **Async When Possible**: Use BaseAsyncObserver for non-blocking operations
- **Caching**: Cache expensive computations when appropriate

---

This guide provides comprehensive coverage of the Observer system. For additional examples and advanced patterns, see the existing observers in `src/observers/all/` and their corresponding unit tests in `spec/unit/observers/`.