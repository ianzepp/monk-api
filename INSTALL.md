# Monk API Installation Guide

Lightweight PaaS backend API built with **Hono** and **TypeScript**, featuring observer-driven architecture and multi-tenant database routing.

## What is Monk API?

A high-performance backend API that provides:
- **Schema-first development** - Define your data models in JSON
- **Multi-tenant architecture** - Each tenant gets isolated databases
- **Observer pattern** - Event-driven business logic hooks
- **REST API** - Full programmatic management interface

Perfect for building SaaS applications that need flexible data modeling and tenant isolation.

## Prerequisites

Before installation, ensure you have:

- **Node.js 18+** and **npm** installed
- **PostgreSQL** server running and accessible
- Ability to connect to PostgreSQL: `psql -d postgres -c "SELECT version();"`

## Quick Start

The fastest way to get started is using the automated setup:

```bash
# Clone and setup
git clone https://github.com/ianzepp/monk-api.git
cd monk-api

# Automated setup (handles database and test tenant)
npm run autoinstall

# Start development server
npm run start:dev

# Test connectivity
npm run spec:sh spec/10-connection/basic-ping.test.sh
```

The `autoinstall` script will:
1. Copy `.env.example` to `.env`
2. Auto-detect your PostgreSQL configuration
3. Install dependencies and build TypeScript
4. Initialize the main database with schema
5. Create a test tenant for development

## Manual Installation

If you prefer manual setup or the autoinstall fails:

### 1. Environment Configuration

Copy the example environment file and configure your database connection:

```bash
# Copy environment template
cp .env.example .env

# Edit with your PostgreSQL credentials
nano .env
```

Update the `DATABASE_URL` in `.env`:
```env
# Example configurations:
DATABASE_URL=postgresql://your_username@localhost:5432/
DATABASE_URL=postgresql://your_username:your_password@localhost:5432/
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Initialize Database

Create and initialize the main database:

```bash
# Create main database
createdb monk_main

# Initialize schema
psql -d monk_main -f sql/init-monk-main.sql
```

### 5. Create Development Tenant

Create a test tenant for development:

```bash
# Create system tenant database
createdb system

# Initialize tenant schema
psql -d system -f sql/init-tenant.sql

# Create development users
psql -d system -c "
INSERT INTO users (name, auth, access, access_read, access_edit, access_full) VALUES
('Development Root User', 'root', 'root', '{}', '{}', '{}'),
('Development Admin User', 'admin', 'full', '{}', '{}', '{}'),
('Development User', 'user', 'edit', '{}', '{}', '{}')
ON CONFLICT (auth) DO NOTHING;
"
```

## Verification

Test your installation:

```bash
# Start the server
npm run start:dev

# In another terminal, test connectivity
curl http://localhost:9001/health

# Test authentication
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant":"system","username":"root"}'
```

## Development Environment

Your development environment includes:

- **Server**: http://localhost:9001
- **Main Database**: `monk_main` (tenant registry)
- **System Tenant**: `system` database with test users
- **Available Users**:
  - `root@system` - Full administrative privileges
  - `admin@system` - Administrative operations
  - `user@system` - Standard user operations

## Core Features

### 🎯 Schema Management
Define data models using JSON with JSON Schema validation:

```json
# user.json
{
  "name": "user",
  "properties": {
    "name": {"type": "string", "minLength": 1},
    "email": {"type": "string", "format": "email"},
    "role": {"type": "string", "enum": ["admin", "user"]}
  },
  "required": ["name", "email"]
}
```

### 🔒 Multi-Tenant Architecture
- JWT-based tenant routing
- Isolated databases per tenant (`tenant_12345678`)
- Dynamic database connections

### 🎭 Observer System
Ring-based business logic execution (0-9 rings):
- **Ring 0**: Validation
- **Ring 2**: Business logic
- **Ring 5**: Database execution
- **Ring 7**: Audit logging
- **Ring 8**: Webhooks/integrations

### 📡 RESTful API
Consistent array/object patterns:
```bash
GET  /api/data/users      # List all users
POST /api/data/users      # Create users (bulk)
GET  /api/data/users/123  # Get specific user
PUT  /api/data/users/123  # Update specific user
```

## API Management

Manage your API using the [monk-cli](https://github.com/ianzepp/monk-cli) tool:

```bash
# Install the CLI
git clone https://github.com/ianzepp/monk-cli.git
cd monk-cli && ./install.sh

# Initialize configuration
monk init

# Tenant management
monk tenant create my-app
monk auth login my-app root

# Schema management
cat contacts.json | monk describe create schema
monk describe select schema contacts

# Data operations
echo '{"name":"John","email":"john@example.com"}' | monk data create contacts
monk data select contacts
```

## Observer Development

Add business logic without touching core code:

```typescript
// src/observers/users/0/email-validator.ts
export default class EmailValidator extends BaseObserver {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        for (const record of context.data) {
            if (!record.email.endsWith('@company.com')) {
                throw new ValidationError('Only company emails allowed', 'email');
            }
        }
    }
}
```

## Testing

Comprehensive test suite with isolated environments:

```bash
# Run all tests
npm run test:all

# Run specific test categories
npm run test:all 15        # Authentication tests
npm run test:all 20-30     # Describe and data API tests

# Individual test
npm run spec:sh spec/15-authentication/basic-auth.test.sh
```

## Performance

- **15x faster schema access** with SHA256 caching
- **Ultra-lightweight** (~50KB Hono framework)
- **Raw SQL performance** without ORM overhead
- **Multi-runtime support** (Node.js, Bun, Deno, Cloudflare Workers)

## Tech Stack

- **[Hono](https://hono.dev/)** - Ultra-fast web framework
- **TypeScript** - Type-safe development
- **PostgreSQL** - Multi-tenant database architecture
- **AJV** - High-performance JSON Schema validation
- **JSON Schema** - Validation and documentation

## Troubleshooting

### Database Connection Issues

Check your `.env` file configuration:
```bash
# Verify environment variables
cat .env
echo "DATABASE_URL: $DATABASE_URL"

# Test PostgreSQL connection
psql -d postgres -c "SELECT version();"
```

### Fresh Installation

For a complete reset:
```bash
# Clean installation with all components
npm run autoinstall -- --force

# Or step by step:
npm run autoinstall -- --clean-node    # Reinstall dependencies
npm run autoinstall -- --clean-dist    # Rebuild TypeScript
npm run autoinstall -- --clean-auth    # Recreate databases
```

### Common Issues

1. **PostgreSQL not running**: Start your PostgreSQL service
2. **Connection refused**: Check DATABASE_URL format and credentials
3. **Permission denied**: Ensure PostgreSQL user has database creation privileges
4. **Port in use**: Change PORT in `.env` or stop conflicting services

> 📖 For detailed architecture, development workflows, and implementation guides, see **[DEVELOPER.md](DEVELOPER.md)**

## Documentation

- **[DEVELOPER.md](DEVELOPER.md)** - Comprehensive development guide
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions
- **Observer System** - Event-driven architecture patterns

## Related Projects

- **[monk-cli](https://github.com/ianzepp/monk-cli)** - Standalone CLI for remote API management

## License

MIT License - see [LICENSE](LICENSE) for details.
