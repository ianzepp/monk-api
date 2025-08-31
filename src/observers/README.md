# Observer Development Guide

This directory contains observers for the ring-based observer system. Observers execute in ordered rings (0-9) for each database operation, enabling extensible business logic without modifying core code.

## Directory Structure

Observers follow a strict directory pattern:
```
src/observers/:schema/:ring_number/observer-name.ts

Examples:
src/observers/users/0/email-validation.ts       # User schema, validation ring
src/observers/users/2/password-policy.ts        # User schema, business logic ring
src/observers/accounts/1/balance-check.ts       # Account schema, security ring
src/observers/all/7/audit-logger.ts            # All schemas, audit ring
src/observers/all/8/webhook-sender.ts          # All schemas, integration ring
```

## Ring Assignments

**Pre-Database Rings (0-4):**
- **Ring 0 - Validation**: JSON Schema validation, input sanitization
- **Ring 1 - Security**: Access control, PII detection, rate limiting
- **Ring 2 - Business**: Complex business logic, domain rules
- **Ring 3 - PreDatabase**: Final pre-database checks, transaction setup
- **Ring 4 - Enrichment**: Data enrichment, defaults, computed fields

**Database Ring (5):**
- **Ring 5 - Database**: 🎯 Actual SQL execution (handled by framework)

**Post-Database Rings (6-9):**
- **Ring 6 - PostDatabase**: Immediate post-database processing
- **Ring 7 - Audit**: Audit logging, change tracking, compliance
- **Ring 8 - Integration**: External APIs, webhooks, cache invalidation
- **Ring 9 - Notification**: User notifications, email alerts, real-time updates

## Schema Targeting

### Specific Schema
Target a specific schema by using the schema name in the directory path:
```typescript
// src/observers/users/0/email-validator.ts
// Only executes for "users" schema operations
```

### Universal Schema
Target ALL schemas using the `all` keyword:
```typescript
// src/observers/all/7/audit-logger.ts
// src/observers/all/8/cache-invalidator.ts
// src/observers/all/9/notifier.ts
// All execute for ANY schema operation
```

## Observer Implementation

### Simple Field Validation (executeOne Pattern)
For simple per-record validation and transformation, use the `executeOne()` pattern:

```typescript
// src/observers/users/0/email-validator.ts
import type { ObserverContext } from '@lib/observers/interfaces.js';
import { BaseObserver } from '@lib/observers/base-observer.js';
import { ObserverRing } from '@lib/observers/types.js';
import { ValidationError } from '@lib/observers/errors.js';

export default class EmailValidator extends BaseObserver {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        if (!record || !record.email) {
            return; // No email to validate
        }

        if (!this.isValidEmail(record.email)) {
            throw new ValidationError('Invalid email format', 'email');
        }

        // Normalize email to lowercase
        record.email = record.email.toLowerCase().trim();
    }

    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}
```

**Benefits of executeOne() pattern:**
- **Cleaner code**: No manual array processing boilerplate
- **Better readability**: Focus on single-record validation logic
- **Easier testing**: Test individual record validation separately
- **Automatic array handling**: BaseObserver handles the loop automatically

### Complex Business Logic (execute Pattern)
For complex observers that need cross-record analysis or custom array processing, override the `execute()` method:

```typescript
// src/observers/accounts/2/balance-validator.ts
import type { ObserverContext } from '@lib/observers/interfaces.js';
import { BaseObserver } from '@lib/observers/base-observer.js';
import { ObserverRing } from '@lib/observers/types.js';
import { BusinessLogicError } from '@lib/observers/errors.js';

export default class BalanceValidator extends BaseObserver {
    ring = ObserverRing.Business;
    operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { data } = context;

        // Complex logic requiring cross-record analysis
        const totalDeposits = data
            .filter(record => record.type === 'deposit')
            .reduce((sum, record) => sum + record.amount, 0);

        const totalWithdrawals = data
            .filter(record => record.type === 'withdrawal')
            .reduce((sum, record) => sum + record.amount, 0);

        if (totalWithdrawals > totalDeposits * 1.1) {
            throw new BusinessLogicError('Batch exceeds overdraft limit');
        }
    }
}
```

**When to use execute() pattern:**
- Cross-record business logic validation
- Batch processing optimizations
- Complex array transformations
- External API integration requiring batch processing

### Choosing the Right Pattern

| Use Case | Pattern | Example |
|----------|---------|---------|
| Field validation | `executeOne()` | Email format validation |
| Data sanitization | `executeOne()` | Input sanitization |
| Field transformation | `executeOne()` | Date normalization |
| Required field checks | `executeOne()` | Mandatory field validation |
| Cross-record logic | `execute()` | Balance calculations |
| Batch optimizations | `execute()` | Bulk API calls |
| Complex aggregations | `execute()` | Statistical calculations |
| Audit logging | `execute()` | Change tracking |

### Universal Observer Template
```typescript
// src/observers/all/7/audit-logger.ts
import type { Observer, ObserverContext } from '@observers/interfaces.js';
import { ObserverRing } from '@observers/types.js';

export default class AuditLogger implements Observer {
    ring = ObserverRing.Audit;
    name = 'AuditLogger';

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, schema, result, existing } = context;

        // Log all database changes for audit trail
        await system.database.createOne('audit_log', {
            operation,
            schema,
            record_id: result?.id,
            changes: this.computeChanges(existing, result),
            user_id: system.getUserId(),
            timestamp: new Date().toISOString()
        });
    }

    private computeChanges(existing: any, result: any): any {
        // Implementation for computing changes
        return { before: existing, after: result };
    }
}
```

## Observer Context

The `ObserverContext` provides access to request data and cross-observer communication:

```typescript
interface ObserverContext {
    system: System;                    // Per-request database context
    operation: 'create' | 'update' | 'delete' | 'select';
    schema: string;                    // Target schema name
    data?: any;                        // Input data (create/update)
    recordId?: string;                 // Target record ID (update/delete/select)
    existing?: any;                    // Existing record (update operations)
    result?: any;                      // Database result (post-DB rings only)
    metadata: Map<string, any>;        // Cross-observer communication
    errors: ValidationError[];         // Accumulated validation errors
    warnings: ValidationWarning[];     // Non-blocking warnings
    startTime: number;                 // Request start time
    currentRing?: ObserverRing;        // Current executing ring
    currentObserver?: string;          // Current executing observer
}
```

## Cross-Observer Communication

Use the `metadata` Map for sharing computed values between observers:

```typescript
// Ring 2 observer computes and stores value
context.metadata.set('balance_change', balanceChange);

// Ring 7 observer retrieves and uses the value
const balanceChange = context.metadata.get('balance_change');
```

## Error Handling

### Validation Errors (Block Execution)
Add errors to stop execution before database operations:
```typescript
context.errors.push({
    message: 'Insufficient credit limit',
    field: 'balance',
    code: 'CREDIT_LIMIT_EXCEEDED',
    ring: this.ring,
    observer: this.name
});
```

### Warnings (Non-blocking)
Add warnings for non-critical issues:
```typescript
context.warnings.push({
    message: 'Email domain not verified',
    field: 'email',
    code: 'UNVERIFIED_DOMAIN',
    ring: this.ring,
    observer: this.name
});
```

## Operation Targeting

Limit observers to specific operations:

```typescript
export default class PasswordValidator implements Observer {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'];  // Only run on create/update

    // Will not execute on 'delete' or 'select' operations
}
```

## Development Tips

1. **Choose the right pattern**: Use `executeOne()` for simple field validation, `execute()` for complex business logic
2. **Keep observers focused**: Each observer should have a single responsibility
3. **Use meaningful names**: Observer name helps with debugging and error tracking
4. **Handle errors with proper types**: Use ValidationError, BusinessLogicError, or SystemError
5. **Extend BaseObserver**: Always extend BaseObserver for consistent error handling and logging
6. **Share computed values**: Use metadata Map to avoid duplicate calculations
7. **Test thoroughly**: Each observer should have comprehensive unit tests
8. **Consider performance**: Observers execute on every request - keep them fast

## Testing Observers

Create unit tests for observers in the same directory:
```
src/observers/users/0/
├── email-validator.ts
└── email-validator.test.ts
```

```typescript
// email-validator.test.ts
import EmailValidator from './email-validator.js';
import { createMockContext } from '../../../spec/helpers/observer-helpers.js';

describe('EmailValidator', () => {
    const validator = new EmailValidator();

    test('should validate correct email', async () => {
        const context = createMockContext('users', 'create', { email: 'test@example.com' });
        await validator.execute(context);
        expect(context.errors).toHaveLength(0);
    });

    test('should reject invalid email', async () => {
        const context = createMockContext('users', 'create', { email: 'invalid-email' });
        await validator.execute(context);
        expect(context.errors).toHaveLength(1);
        expect(context.errors[0].code).toBe('INVALID_EMAIL');
    });
});
```

## Framework Integration

Observers are automatically discovered and loaded at server startup. No manual registration required.

The framework:
1. **Discovers** observers using file path patterns
2. **Loads** and validates observer classes
3. **Caches** observers in memory for performance
4. **Executes** observers in ring order for each operation
5. **Aggregates** errors and warnings across all rings

Phase 1 includes the framework infrastructure. Phases 2-4 will add example observers and database integration.
