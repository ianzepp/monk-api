# Filter System Rework

## Overview

This document outlines a proposed rework of the filter system (`src/lib/filter*.ts`) to address architectural issues identified in code review.

## Current Architecture

```
Filter (facade) → FilterWhere/FilterWhereSqlite (WHERE generation)
               → FilterOrder (ORDER BY generation)
               → FilterSqlGenerator (SQL composition)
               → filter-types.ts (shared types)
```

**Issues identified:**
- Mutable state in classes (parse, validate, generate all interleaved)
- Dialect differences handled via inheritance (harder to test/extend)
- Soft-delete columns hardcoded (`deleted_at`, `trashed_at`)
- Lots of `any` types, weak type safety
- No schema validation (unknown fields cause SQL errors, not clear messages)
- Dead code (`_query`, `_lookups`, `_related`, `ConditionNode` type)

## Proposed Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Parse     │ ──▶ │  Validate   │ ──▶ │     AST     │ ──▶ │   Render    │
│  (JSON→AST) │     │  (schema)   │     │  (typed)    │     │ (AST→SQL)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                                       │
                          ▼                                       ▼
                  ┌───────────────┐                       ┌───────────────┐
                  │ NamespaceCache│                       │    Dialect    │
                  │ (Field, Model)│                       │ (pg / sqlite) │
                  └───────────────┘                       └───────────────┘
```

**Key principles:**
- Pure functions instead of stateful classes
- Explicit AST representation (strongly typed)
- Dialect as composition, not inheritance
- Schema validation via NamespaceCache
- Soft-delete dynamically determined per-model

---

## Core Types (AST)

```typescript
// Explicit, strongly-typed expression tree
type Expr =
  | { type: 'field'; name: string; op: ComparisonOp; value: unknown }
  | { type: 'and'; children: Expr[] }
  | { type: 'or'; children: Expr[] }
  | { type: 'not'; child: Expr }
  | { type: 'raw'; sql: string; params: unknown[] }; // escape hatch

type ComparisonOp =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'nin' | 'like' | 'nlike' | 'ilike' | 'nilike'
  | 'regex' | 'nregex'
  | 'any' | 'all' | 'nany' | 'nall' | 'size'
  | 'between' | 'null' | 'exists'
  | 'find' | 'text' | 'search';

interface FilterAST {
  where?: Expr;
  order?: Array<{ field: string; dir: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
  select?: string[];
}

interface QueryResult {
  sql: string;
  params: unknown[];
}
```

---

## Dialect Interface

Handles PostgreSQL vs SQLite differences via composition:

```typescript
interface SqlDialect {
  readonly name: 'postgresql' | 'sqlite';

  // Placeholder style: PostgreSQL uses $1, $2; SQLite uses ?
  placeholder(index: number): string;

  // Identifier quoting
  quote(identifier: string): string;

  // Operator support check - returns false if not supported
  supportsOperator(op: ComparisonOp): boolean;

  // Render a condition - throws if operator not supported
  renderCondition(
    field: string,        // already quoted
    op: ComparisonOp,
    addParam: (value: unknown) => string  // returns placeholder
  ): string;

  // Array literal syntax (for $in, $any, etc.)
  renderArrayLiteral(placeholders: string[]): string;

  // Array length expression (for $size)
  renderArrayLength(field: string): string;
}
```

### Dialect Differences

| Feature | PostgreSQL | SQLite |
|---------|------------|--------|
| Placeholder | `$1, $2, $3` | `?, ?, ?` |
| Case-insensitive | `ILIKE` | `LIKE ... COLLATE NOCASE` |
| Regex | `~ pattern` | `regexp(pattern, field)` |
| Array overlap | `field && ARRAY[...]` | Not supported |
| Array contains | `field @> ARRAY[...]` | Not supported |
| Array length | `array_length(field, 1)` | `json_array_length(field)` |
| Full-text search | `to_tsvector(...) @@ plainto_tsquery(...)` | Not supported |

### PostgreSQL Dialect

```typescript
const postgresDialect: SqlDialect = {
  name: 'postgresql',

  placeholder: (n) => `$${n}`,

  quote: (id) => `"${id}"`,

  supportsOperator: () => true,  // PostgreSQL supports everything

  renderCondition(field, op, addParam) {
    switch (op) {
      case 'eq': return (v) => v === null
        ? `${field} IS NULL`
        : `${field} = ${addParam(v)}`;
      case 'ilike': return (v) => `${field} ILIKE ${addParam(v)}`;
      case 'regex': return (v) => `${field} ~ ${addParam(v)}`;
      case 'any': return (values) => {
        const params = values.map(v => addParam(v)).join(', ');
        return `${field} && ARRAY[${params}]`;
      };
      case 'all': return (values) => {
        const params = values.map(v => addParam(v)).join(', ');
        return `${field} @> ARRAY[${params}]`;
      };
      case 'search': return (v) =>
        `to_tsvector('english', ${field}) @@ plainto_tsquery('english', ${addParam(v)})`;
      // ... other operators
    }
  },

  renderArrayLiteral: (placeholders) => `ARRAY[${placeholders.join(', ')}]`,

  renderArrayLength: (field) => `array_length(${field}, 1)`,
};
```

### SQLite Dialect

```typescript
const sqliteDialect: SqlDialect = {
  name: 'sqlite',

  placeholder: () => '?',  // SQLite uses positional ? regardless of index

  quote: (id) => `"${id}"`,

  supportsOperator(op) {
    const unsupported = ['any', 'all', 'nany', 'nall', 'search'];
    return !unsupported.includes(op);
  },

  renderCondition(field, op, addParam) {
    if (!this.supportsOperator(op)) {
      throw HttpErrors.badRequest(
        `Operator $${op} not supported on SQLite`,
        'FILTER_UNSUPPORTED_SQLITE'
      );
    }

    switch (op) {
      case 'eq': return (v) => v === null
        ? `${field} IS NULL`
        : `${field} = ${addParam(v)}`;
      case 'ilike': return (v) =>
        `${field} LIKE ${addParam(v)} COLLATE NOCASE`;
      case 'regex': return (v) =>
        `regexp(${addParam(v)}, ${field})`;  // Note: args swapped
      // ... other operators
    }
  },

  renderArrayLiteral: (placeholders) => `(${placeholders.join(', ')})`,

  renderArrayLength: (field) => `json_array_length(${field})`,
};
```

---

## Schema Validation with NamespaceCache

Uses existing `NamespaceCache`, `Model`, and `Field` classes for runtime validation.

### Available Field Metadata

```typescript
// From Field class (src/lib/field.ts)
field.type        // 'string' | 'number' | 'uuid' | 'boolean' | ...
field.isArray     // true → allow $any, $all, $size
field.searchable  // true → allow $search (full-text)
field.enumValues  // string[] → validate $in values
field.minimum     // number → validate $gte lower bound
field.maximum     // number → validate $lte upper bound
```

### Validation Implementation

```typescript
function validateFilter(
  ast: FilterAST,
  modelName: string,
  cache: NamespaceCache,
  dialect: SqlDialect
): FilterAST {
  if (!cache.hasModel(modelName)) {
    throw HttpErrors.notFound(`Model '${modelName}' not found`);
  }

  if (ast.where) {
    validateExpr(ast.where, modelName, cache, dialect);
  }

  if (ast.select) {
    for (const fieldName of ast.select) {
      if (!cache.getField(modelName, fieldName)) {
        throw HttpErrors.badRequest(`Unknown field: ${fieldName}`);
      }
    }
  }

  return ast;
}

function validateExpr(
  expr: Expr,
  modelName: string,
  cache: NamespaceCache,
  dialect: SqlDialect
): void {
  if (expr.type === 'field') {
    const field = cache.getField(modelName, expr.name);

    if (!field) {
      throw HttpErrors.badRequest(`Unknown field: ${expr.name}`);
    }

    // Check dialect supports this operator BEFORE type checking
    if (!dialect.supportsOperator(expr.op)) {
      throw HttpErrors.badRequest(
        `Operator $${expr.op} not supported on ${dialect.name}`,
        'FILTER_UNSUPPORTED_OPERATOR'
      );
    }

    // Then check field type compatibility
    validateOperatorForField(expr.op, expr.value, field);
  } else if (expr.type === 'and' || expr.type === 'or') {
    expr.children.forEach(c => validateExpr(c, modelName, cache, dialect));
  } else if (expr.type === 'not') {
    validateExpr(expr.child, modelName, cache, dialect);
  }
}

function validateOperatorForField(op: ComparisonOp, value: unknown, field: Field): void {
  // Array operators require array fields
  if (['any', 'all', 'nany', 'nall', 'size'].includes(op) && !field.isArray) {
    throw HttpErrors.badRequest(
      `Operator $${op} requires array field, but '${field.fieldName}' is not an array`
    );
  }

  // Full-text search requires searchable field
  if (op === 'search' && !field.searchable) {
    throw HttpErrors.badRequest(
      `Operator $search requires searchable field, but '${field.fieldName}' is not searchable`
    );
  }

  // Comparison operators on non-numeric types
  if (['gt', 'gte', 'lt', 'lte', 'between'].includes(op)) {
    if (!['number', 'integer', 'float', 'date', 'datetime'].includes(field.type)) {
      throw HttpErrors.badRequest(
        `Operator $${op} requires numeric/date field, but '${field.fieldName}' is type '${field.type}'`
      );
    }
  }

  // Validate $in values against enum
  if (op === 'in' && field.enumValues) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (!field.enumValues.includes(v as string)) {
        throw HttpErrors.badRequest(
          `Invalid enum value '${v}' for field '${field.fieldName}'`
        );
      }
    }
  }
}
```

---

## Dynamic Soft-Delete

Instead of hardcoding `deleted_at` and `trashed_at`, check if the model has these fields:

```typescript
function buildSoftDeleteExpr(
  modelName: string,
  cache: NamespaceCache,
  trashed: TrashedOption
): Expr | null {
  const exprs: Expr[] = [];

  // Only add deleted_at filter if field exists
  const deletedAtField = cache.getField(modelName, 'deleted_at');
  if (deletedAtField) {
    exprs.push({ type: 'field', name: 'deleted_at', op: 'null', value: true });
  }

  // Only add trashed_at filter if field exists
  const trashedAtField = cache.getField(modelName, 'trashed_at');
  if (trashedAtField) {
    if (trashed === 'exclude') {
      exprs.push({ type: 'field', name: 'trashed_at', op: 'null', value: true });
    } else if (trashed === 'only') {
      exprs.push({ type: 'field', name: 'trashed_at', op: 'null', value: false });
    }
    // 'include' → no filter
  }

  if (exprs.length === 0) return null;
  if (exprs.length === 1) return exprs[0];
  return { type: 'and', children: exprs };
}
```

---

## Rendering (Pure Functions)

```typescript
function renderQuery(
  table: string,
  ast: FilterAST,
  dialect: SqlDialect
): QueryResult {
  const params: unknown[] = [];
  const addParam = (v: unknown) => {
    params.push(v);
    return dialect.placeholder(params.length);
  };

  const whereClause = ast.where
    ? renderExpr(ast.where, dialect, addParam)
    : null;

  const sql = [
    `SELECT ${renderSelect(ast.select, dialect)}`,
    `FROM ${dialect.quote(table)}`,
    whereClause && `WHERE ${whereClause}`,
    renderOrder(ast.order, dialect),
    renderLimit(ast.limit, ast.offset),
  ].filter(Boolean).join(' ');

  return { sql, params };
}

function renderExpr(
  expr: Expr,
  dialect: SqlDialect,
  addParam: (v: unknown) => string
): string {
  switch (expr.type) {
    case 'field': {
      const quoted = dialect.quote(expr.name);
      return dialect.renderCondition(quoted, expr.op, addParam)(expr.value);
    }
    case 'and':
      return `(${expr.children.map(c => renderExpr(c, dialect, addParam)).join(' AND ')})`;
    case 'or':
      return `(${expr.children.map(c => renderExpr(c, dialect, addParam)).join(' OR ')})`;
    case 'not':
      return `NOT (${renderExpr(expr.child, dialect, addParam)})`;
    case 'raw':
      expr.params.forEach(p => addParam(p));
      return expr.sql;
  }
}

function renderSelect(select: string[] | undefined, dialect: SqlDialect): string {
  if (!select || select.length === 0 || select.includes('*')) {
    return '*';
  }
  return select.map(col => dialect.quote(col)).join(', ');
}

function renderOrder(
  order: Array<{ field: string; dir: 'asc' | 'desc' }> | undefined,
  dialect: SqlDialect
): string {
  if (!order || order.length === 0) return '';
  const clauses = order.map(o => `${dialect.quote(o.field)} ${o.dir.toUpperCase()}`);
  return `ORDER BY ${clauses.join(', ')}`;
}

function renderLimit(limit?: number, offset?: number): string {
  if (limit === undefined) return '';
  let clause = `LIMIT ${limit}`;
  if (offset !== undefined) clause += ` OFFSET ${offset}`;
  return clause;
}
```

---

## Entry Point

```typescript
function buildQuery(
  input: unknown,
  modelName: string,
  system: SystemContext,
  options: FilterOptions = {}
): QueryResult {
  // Select dialect based on adapter
  const dialect = system.adapter.type === 'sqlite'
    ? sqliteDialect
    : postgresDialect;

  const cache = system.namespaceCache;

  // 1. Parse JSON input to AST
  const ast = parseFilter(input);

  // 2. Validate against schema + dialect capabilities
  validateFilter(ast, modelName, cache, dialect);

  // 3. Inject soft-delete based on model fields
  const softDeleteExpr = buildSoftDeleteExpr(modelName, cache, options.trashed ?? 'exclude');
  const finalAst = softDeleteExpr
    ? { ...ast, where: ast.where
        ? { type: 'and', children: [softDeleteExpr, ast.where] }
        : softDeleteExpr }
    : ast;

  // 4. Render with correct dialect
  return renderQuery(modelName, finalAst, dialect);
}
```

---

## Usage Example

```typescript
// Clean, composable, testable
const { sql, params } = buildQuery(
  {
    where: { name: { $ilike: 'john%' }, status: 'active' },
    order: [{ field: 'created_at', dir: 'desc' }],
    limit: 10
  },
  'users',
  system
);

// PostgreSQL output:
// sql: SELECT * FROM "users" WHERE "deleted_at" IS NULL AND "trashed_at" IS NULL
//      AND ("name" ILIKE $1 AND "status" = $2) ORDER BY "created_at" DESC LIMIT 10
// params: ['john%', 'active']

// SQLite output:
// sql: SELECT * FROM "users" WHERE "deleted_at" IS NULL AND "trashed_at" IS NULL
//      AND ("name" LIKE ? COLLATE NOCASE AND "status" = ?) ORDER BY "created_at" DESC LIMIT 10
// params: ['john%', 'active']
```

---

## Validation Improvements Summary

| Validation | Current | Proposed |
|------------|---------|----------|
| Field exists | Runtime SQL error | Clear error before query |
| Operator + type match | None | `$search` only on `searchable` |
| Array ops on arrays | None | `$any` only on `isArray` |
| Enum validation | None | `$in` values checked |
| Dialect support | Runtime error during render | Validated upfront |
| Soft-delete columns | Hardcoded | Dynamic per-model |

---

## Migration Strategy

1. **Phase 1**: Implement new types (`Expr`, `FilterAST`) alongside existing code
2. **Phase 2**: Implement `parseFilter()` that produces AST from current JSON format
3. **Phase 3**: Implement `validateFilter()` with NamespaceCache integration
4. **Phase 4**: Implement dialect objects and `renderQuery()`
5. **Phase 5**: Wire up new entry point, deprecate old Filter class
6. **Phase 6**: Remove old code

Each phase can be tested independently. The JSON input format remains the same, so no API changes required.

---

## Files to Create

```
src/lib/filter2/
├── types.ts           # Expr, FilterAST, ComparisonOp, QueryResult
├── parse.ts           # parseFilter(input) → FilterAST
├── validate.ts        # validateFilter(ast, model, cache, dialect)
├── render.ts          # renderQuery(ast, dialect) → QueryResult
├── dialects/
│   ├── types.ts       # SqlDialect interface
│   ├── postgresql.ts  # postgresDialect
│   └── sqlite.ts      # sqliteDialect
├── soft-delete.ts     # buildSoftDeleteExpr()
└── index.ts           # buildQuery() entry point, re-exports
```

---

## What to Keep from Current Implementation

1. **The operator enum** (`FilterOp`) - good for autocomplete and validation
2. **The field name regex** - solid SQL injection protection: `/^[a-zA-Z_][a-zA-Z0-9_]*$/`
3. **The shorthand normalization** - string → id lookup, array → `$in`
4. **HttpErrors integration** - consistent error handling

## What to Remove

1. `Filter._query` - never used
2. `Filter._lookups`, `Filter._related` - declared but never populated
3. `ConditionNode` type - unused, replaced by `Expr`
4. `console.debug()` calls - use structured logging or remove
5. Hardcoded soft-delete logic - becomes dynamic
