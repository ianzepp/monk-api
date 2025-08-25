# Monk API

Lightweight PaaS backend API built with **Hono** and **TypeScript**, featuring observer-driven architecture and multi-tenant database routing.

## What is Monk API?

A high-performance backend API that provides:
- **Schema-first development** - Define your data models in YAML
- **Multi-tenant architecture** - Each tenant gets isolated databases
- **Observer pattern** - Event-driven business logic hooks
- **CLI integration** - Full command-line management interface

Perfect for building SaaS applications that need flexible data modeling and tenant isolation.

## Quick Start

```bash
# Clone and setup
git clone https://github.com/ianzepp/monk-api.git
cd monk-api

# Automated setup (handles database, CLI, and test tenant)
npm run autoinstall

# Start development server
npm run start:dev

# Test connectivity
npm run spec:sh spec/10-connection/basic-ping.test.sh
```

## Core Features

### 🎯 Schema Management
Define data models using YAML with JSON Schema validation:

```yaml
# user.yaml
name: user
properties:
  name: {type: string, minLength: 1}
  email: {type: string, format: email}
  role: {type: string, enum: [admin, user]}
required: [name, email]
```

### 🔒 Multi-Tenant Architecture
- JWT-based tenant routing
- Isolated databases per tenant (`monk-api$tenant-name`)
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

## Built-in CLI

The included CLI provides full API management:

```bash
# Tenant management
monk tenant create my-app
monk auth login my-app root

# Schema management  
cat user.yaml | monk meta create schema
monk meta list schema

# Data operations
echo '{"name":"John","email":"john@example.com"}' | monk data create user
monk data list user
```

## Observer Development

Add business logic without touching core code:

```typescript
// src/observers/user/0/email-validator.ts
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
npm run test:all 20-30     # Meta and data API tests

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
- **Bashly** - Generated CLI interface

> 📖 For detailed architecture, development workflows, and implementation guides, see **[DEVELOPER.md](DEVELOPER.md)**

## Documentation

- **[DEVELOPER.md](DEVELOPER.md)** - Comprehensive development guide
- **[INSTALL.md](INSTALL.md)** - Installation instructions
- **Observer System** - Event-driven architecture patterns

## Related Projects

- **[monk-cli](https://github.com/ianzepp/monk-cli)** - Standalone CLI for remote API management
- **[monk-api-test](https://github.com/ianzepp/monk-api-test)** - Git-aware testing framework

## License

MIT License - see [LICENSE](LICENSE) for details.