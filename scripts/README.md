# Scripts Directory

This directory contains CLI scripts for development, testing, and deployment tasks. Scripts are written in either **Shell** (.sh) for system operations or **TypeScript** (.ts) for application logic.

## Script Categories

### Setup & Installation

#### `autoinstall.sh`
Automated fresh installation for development environment.

**Purpose:** One-command setup that auto-detects PostgreSQL configuration, creates .env file, installs dependencies, initializes database, and builds the project.

**Usage:**
```bash
npm run autoinstall
```

**What it does:**
- Auto-detects DATABASE_URL from PostgreSQL (macOS/Linux patterns)
- Creates and populates .env file from .env.example
- Runs npm install
- Calls install:db to setup monk database
- Builds TypeScript code

**When to use:** Fresh clone, new development machine, or complete environment reset.

---

#### `install-db.sh`
Database-only installation script.

**Purpose:** Creates the core monk database and deploys infrastructure tables without mixing npm concerns.

**Usage:**
```bash
npm run install:db              # Create monk DB if not exists
npm run install:db -- --force   # Drop and recreate monk DB
npm run install:db -- --drop    # Drop and recreate monk DB (alias)
```

**What it does:**
- Parses DATABASE_URL from .env file
- Creates monk database (PostgreSQL)
- Deploys infrastructure tables (tenants, templates, users, tenant_fixtures)
- Verifies installation and lists tables

**When to use:**
- Database corruption or schema issues
- Need to reset infrastructure tables
- Fresh database setup without full reinstall

---

### Build & Compilation

#### `build.sh`
Main build script for TypeScript compilation.

**Purpose:** Compiles TypeScript to JavaScript, generates type declarations, runs post-build tasks (TODO extraction, deprecated API tracking).

**Usage:**
```bash
npm run build
```

**What it does:**
- Compiles TypeScript using tsc
- Runs tsc-alias to resolve path aliases
- Extracts TODO/FIXME tags → TODO.md
- Extracts @deprecated JSDoc → DEPRECATED.md
- Generates OpenAPI specification

**When to use:** After code changes, before running tests, before deployment.

---

#### `build-todos.sh`
Extracts TODO/FIXME/HACK tags from codebase.

**Purpose:** Automatically generates TODO.md with categorized tags and code context for technical debt tracking.

**Usage:**
```bash
npm run build:todo
```

**What it does:**
- Searches for TODO, FIXME, HACK, XXX, NOTE, OPTIMIZE tags
- Shows 3 lines of context before and after
- Generates TODO.md with syntax highlighting
- Categories by tag priority

**Output:** `TODO.md` (auto-generated, gitignored)

---

#### `build-deprecated.sh`
Extracts @deprecated JSDoc annotations.

**Purpose:** Tracks deprecated APIs for migration planning.

**Usage:**
```bash
npm run build:deprecated
```

**What it does:**
- Searches for @deprecated JSDoc tags
- Shows 5 lines before, 10 lines after (full function context)
- Extracts deprecation reason from JSDoc
- Uses collapsible `<details>` sections in markdown

**Output:** `DEPRECATED.md` (auto-generated, gitignored)

---

### Testing

#### `test-sh.sh`
Test runner for shell-based integration tests.

**Purpose:** Runs shell scripts in `spec/**/*.sh` for end-to-end API testing.

**Usage:**
```bash
npm run test:sh              # Run all shell tests
npm run test:sh spec/api/*   # Run specific tests
```

**When to use:** Integration testing, API endpoint validation, fixture testing.

---

#### `test-ts.sh`
Test runner for TypeScript unit tests.

**Purpose:** Runs TypeScript tests using Vitest.

**Usage:**
```bash
npm run test:ts              # Run all TypeScript tests
npm run test:ts -- --watch   # Watch mode
```

**When to use:** Unit testing, TDD development, CI/CD pipelines.

---

### Fixtures Management

#### `fixtures-build.ts`
Compiles fixture source files into deployable SQL.

**Purpose:** Converts fixture JSON/models into SQL that can be deployed to tenant namespaces. Handles dependency resolution (e.g., system fixture dependency).

**Usage:**
```bash
npm run fixtures:build system     # Build system fixture
npm run fixtures:build demo       # Build demo fixture
npm run fixtures:build all        # Build all fixtures
```

**What it does:**
- Reads fixture source files from `fixtures/<name>/`
- Generates SQL INSERT statements
- Resolves fixture dependencies
- Creates deployable SQL files

**When to use:** After modifying fixture data or models, before deploying fixtures.

---

#### `fixtures-deploy.ts`
Deploys fixtures to a tenant namespace.

**Purpose:** Deploys built fixtures to a specific tenant's namespace with dependency resolution.

**Usage:**
```bash
npm run fixtures:deploy <tenant-name> <fixture-name>
npm run fixtures:deploy mycompany system
npm run fixtures:deploy demo_sales demo
```

**What it does:**
- Deploys fixture SQL to tenant namespace
- Automatically deploys dependencies (system fixture first)
- Sets search_path for namespace isolation
- Verifies deployment success

**When to use:** Seeding tenant data, testing with specific datasets, demo environments.

---

#### `fixtures-generate.ts`
Generates synthetic test data using faker.

**Purpose:** Creates large JSON datasets for testing (accounts, contacts) with realistic fake data.

**Usage:**
```bash
npm run fixtures:generate <template-name> <record-count>
npm run fixtures:generate testing_large 1000
npm run fixtures:generate demo_small 50
```

**What it does:**
- Uses @faker-js/faker for realistic data
- Generates accounts (name, email, username, balance, etc.)
- Generates contacts (name, email, phone, company, etc.)
- Validates template name format
- Respects fixture lock files

**Output:** `fixtures/<template>/data/*.json`

**When to use:**
- Load testing with large datasets
- Creating varied test scenarios
- Generating demo data

---

#### `fixtures-lock.sh`
Locks fixtures to prevent accidental regeneration.

**Purpose:** Creates `.locked` file in fixture directory to prevent `fixtures:generate` from overwriting production fixtures.

**Usage:**
```bash
npm run fixtures:lock <template-name>
npm run fixtures:lock system
```

**When to use:** After finalizing production fixtures, protecting reference datasets.

---

### Tenant Management

#### `tenant-create.ts`
Creates a new tenant with namespace isolation.

**Purpose:** Creates tenant record, PostgreSQL namespace, and deploys fixtures without JWT/auth concerns. Direct database-level tenant creation for development.

**Usage:**
```bash
npm run tenant:create <tenant-name> <fixture-name>
npm run tenant:create mycompany system
npm run tenant:create demo_sales demo
```

**What it does:**
- Creates tenant record in monk.tenants
- Creates PostgreSQL namespace (schema) for isolation
- Deploys requested fixture with dependency resolution
- Creates default root user (if not in fixture)
- Returns tenant details and credentials

**When to use:**
- Development tenant creation
- Testing with isolated tenants
- Quick tenant setup without auth API

---

#### `tenant-delete.ts`
Deletes a tenant and all associated data.

**Purpose:** Removes tenant namespace and database record. **DESTRUCTIVE** operation requiring --force flag.

**Usage:**
```bash
npm run tenant:delete -- <tenant-name> --force
npm run tenant:delete -- test_env --force
```

**What it does:**
- Looks up tenant in monk.tenants
- Shows tenant details for confirmation
- Drops PostgreSQL namespace with CASCADE
- Deletes tenant record from database
- Lists available tenants if not found

**When to use:**
- Cleaning up test tenants
- Removing abandoned tenants
- Development environment cleanup

**⚠️ WARNING:** Cannot be undone! All tenant data permanently deleted.

---

### Utilities

#### `decrypt.ts`
Decrypts API responses encrypted with `?encrypt=pgp` parameter.

**Purpose:** Developer utility for decrypting and debugging encrypted API responses. Uses JWT token as decryption key.

**Usage:**
```bash
tsx scripts/decrypt.ts <jwt-token> < encrypted.txt
tsx scripts/decrypt.ts <jwt-token> encrypted.txt
curl /api/user/whoami?encrypt=pgp -H "Authorization: Bearer $JWT" | tsx scripts/decrypt.ts "$JWT"
```

**What it does:**
- Parses ASCII armor format
- Extracts IV, ciphertext, and auth tag
- Derives encryption key from JWT (PBKDF2)
- Decrypts using AES-256-GCM

**When to use:**
- Testing encrypted responses
- Debugging encryption issues
- Verifying encrypted data format

---

## Shell vs TypeScript

### When to use Shell (.sh)

**Use shell scripts for:**
- System operations (git, psql, file manipulation)
- Build tooling and compilation
- Text processing (grep, sed, awk)
- Fast execution without compilation
- PostgreSQL command-line operations

**Examples:** `build.sh`, `install-db.sh`, `autoinstall.sh`

### When to use TypeScript (.ts)

**Use TypeScript scripts for:**
- Application logic requiring types/models
- Database operations using app code
- Fixture deployment and management
- Complex data transformations
- Code reuse from src/ directory

**Examples:** `tenant-create.ts`, `fixtures-build.ts`, `decrypt.ts`

## Common Workflows

### Fresh Installation
```bash
npm run autoinstall
```

### Reset Database Only
```bash
npm run install:db -- --force
```

### Create Test Tenant
```bash
npm run tenant:create test_company system
# ... do testing ...
npm run tenant:delete -- test_company --force
```

### Build and Deploy Fixtures
```bash
npm run fixtures:build demo
npm run fixtures:deploy mycompany demo
```

### Generate Large Test Dataset
```bash
npm run fixtures:generate testing_large 5000
npm run fixtures:lock testing_large
```

### Development Cycle
```bash
npm run build                    # Compile TypeScript
npm run test:ts                  # Run unit tests
npm run test:sh                  # Run integration tests
```

### Decrypt API Response
```bash
curl "http://localhost:9001/api/users?encrypt=pgp" \
  -H "Authorization: Bearer $JWT" \
  | tsx scripts/decrypt.ts "$JWT"
```

## Environment Variables

Most scripts automatically load `.env` via:
- Shell scripts: Source .env or use exported variables
- TypeScript scripts: `import 'dotenv/config'`

**Required variables:**
- `DATABASE_URL` - PostgreSQL connection string

## Legacy Scripts

### `fixtures-build.sh` (Legacy)
Old shell-based fixtures build script. Replaced by `fixtures-build.ts` which offers better type safety and code reuse. Available via `npm run fixtures:build:legacy` for backward compatibility.

## Script Permissions

All scripts are executable (`chmod +x`):
```bash
ls -la scripts/*.sh scripts/*.ts
```

## Adding New Scripts

1. **Shell scripts:** Place in `scripts/` with `.sh` extension
2. **TypeScript scripts:** Place in `scripts/` with `.ts` extension, add shebang `#!/usr/bin/env tsx`
3. **Update package.json:** Add npm script entry
4. **Make executable:** `chmod +x scripts/your-script.{sh,ts}`
5. **Update this README:** Document purpose and usage

## Troubleshooting

### "DATABASE_URL not configured"
- Ensure `.env` file exists with valid `DATABASE_URL`
- Run `npm run autoinstall` to auto-detect configuration

### "Permission denied"
- Make script executable: `chmod +x scripts/script-name.sh`

### "tsx: command not found"
- Install dependencies: `npm install`
- Use npx: `npx tsx scripts/script-name.ts`

### "Tenant already exists"
- Delete existing tenant: `npm run tenant:delete -- tenant-name --force`
- Or choose different tenant name

### "Fixture not found"
- List available fixtures: `ls fixtures/`
- Build fixture first: `npm run fixtures:build <name>`

## Documentation

For more details on specific subsystems:
- **Database Architecture:** See `src/lib/database-connection.ts`
- **Namespace Management:** See `src/lib/namespace-manager.ts`
- **Fixture System:** See `src/lib/fixtures/`
- **Authentication:** See `src/routes/auth/`

---

**Last Updated:** 2025-11-24
