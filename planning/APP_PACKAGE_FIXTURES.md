# App Package Fixtures

Use SQLite import for app package first-time setup instead of programmatic model creation.

## Current Approach

App packages define models programmatically on first load:

```typescript
await system.describe.models.createOne({ model_name: 'todos', ... });
await system.describe.fields.createOne({ model_name: 'todos', field_name: 'title', ... });
await system.describe.fields.createOne({ model_name: 'todos', field_name: 'done', ... });
// ... many individual operations
```

## Proposed Approach

App packages ship a SQLite fixture file:

```
packages/todos/
├── src/
├── fixtures/
│   └── setup.sqlite    # Models, fields, seed data
└── package.json
```

On first load, the app loader imports the fixture:

```typescript
const fixture = await Bun.file(join(appPath, 'fixtures/setup.sqlite')).arrayBuffer();
await system.database.importAll(new Uint8Array(fixture), {
  strategy: 'merge',  // Only create what doesn't exist
  include: ['describe', 'data']
});
```

## Benefits

- **Single operation** vs many individual creates
- **Inspectable** with any SQLite browser
- **Portable** - same fixture for external or tenant namespace
- **Seed data included** - sample records, default configs
- **Version controlled** - fixture is a binary artifact

## Implementation

1. Add fixture discovery to app loader (`loadHybridApp`)
2. Check for `fixtures/setup.sqlite` in app package
3. Import with `merge` strategy on first load
4. Skip if models already exist (merge handles this)

## Fixture Creation

App developers create fixtures by:

1. Setting up models/data in a dev tenant
2. Exporting: `POST /api/bulk/export { "stripAccess": true }`
3. Saving to `fixtures/setup.sqlite`
