# Monk API

## Executive Summary

**Modern PaaS Backend Framework** - Ultra-lightweight Platform-as-a-Service API built with Hono and TypeScript, featuring schema-first development, multi-tenant architecture, and ring-based observer system for building high-performance SaaS applications.

## For AI Agents & Contributors

IMPORTANT: Before starting any task, read [AGENTS.md](./AGENTS.md) for project-specific instructions and patterns.

### Project Overview
- **Language**: TypeScript with Hono ultra-fast web framework
- **Purpose**: Lightweight PaaS backend for rapid SaaS application development
- **Architecture**: Schema-first development with ring-based observer pattern
- **Database**: Multi-tenant PostgreSQL with automatic tenant routing
- **Performance**: 15x faster schema access, ultra-lightweight framework (~50KB)

### Key Features
- **Schema-First Development**: JSON-based data model definitions with in-house validation
- **Multi-Tenant Architecture**: Automatic tenant isolation with dedicated database instances
- **Infrastructure Management**: Templates, Sandboxes, and Snapshots for rapid provisioning and testing
- **Ring-Based Observer System**: Sophisticated event-driven business logic (0-9 execution rings)
- **Ultra-Fast Performance**: Hono framework with multi-runtime support (Node.js, Bun, Deno, Cloudflare Workers)
- **RESTful API**: Automatic REST endpoint generation from schema definitions
- **Comprehensive Testing**: Isolated test environments with 30x faster template-based setup

### Technical Architecture
- **Modern Framework Stack**: Hono (~50KB) + TypeScript + PostgreSQL
- **Observer System**: Ring-based execution model for predictable business logic flow
- **CLI Integration**: Complete management via monk-cli standalone tool

**Detailed Architecture**: See [DEVELOPER.md](DEVELOPER.md) for comprehensive technical specifications

### Ring-Based Observer Architecture
**Execution Rings (0-9)**: Input validation → Business logic → Database execution → Audit → Integrations

### Multi-Tenant Capabilities
- **Database Isolation**: Dedicated PostgreSQL per tenant with JWT-based routing
- **Schema Independence**: Tenants evolve independently without interference
- **Template System**: Instant tenant provisioning from pre-configured templates (30x faster)
- **Sandboxes**: Temporary testing environments with automatic expiration
- **Snapshots**: Point-in-time backups with async processing for disaster recovery
- **Performance**: SHA256 caching provides 15x faster schema access

**Multi-Tenant Architecture**: See [DEVELOPER.md](DEVELOPER.md) for detailed tenant management

### API Design Patterns
**Consistent Array/Object Patterns**:
```bash
GET  /api/data/users      # List all users (array response)
POST /api/data/users      # Create users - bulk operations (array input)
GET  /api/data/users/123  # Get specific user (object response)
PUT  /api/data/users/123  # Update specific user (object input)
```

### Development Features
- **Hot Reload**: Development server with automatic TypeScript compilation
- **CLI Management**: Complete API management via monk-cli tool
- **Testing**: Comprehensive test suite with shell script coverage
- **Multi-Runtime**: Node.js, Bun, Deno, Cloudflare Workers support

**Development Guide**: See [DEVELOPER.md](DEVELOPER.md) for complete development workflows

### Performance Optimizations
- **Ultra-Lightweight**: ~50KB Hono framework vs traditional heavy frameworks
- **Schema Caching**: 15x performance improvement with SHA256-based caching
- **Raw SQL**: Direct execution without ORM overhead

**Performance Details**: See [DEVELOPER.md](DEVELOPER.md) for optimization strategies

### Enterprise Features
- **Security**: Built-in auth, JWT-based tenant routing, sudo escalation, comprehensive audit trails
- **Infrastructure Management**: API-driven templates, sandboxes, and snapshots for DevOps workflows
- **Disaster Recovery**: Point-in-time snapshots with async backup processing
- **Safe Testing**: Isolated sandboxes with team collaboration and automatic cleanup
- **Scalability**: Horizontal scaling through tenant distribution
- **Documentation**: Extensive developer guides and implementation documentation

### Use Cases
- **SaaS Application Backend**: Rapid development platform for multi-tenant SaaS applications
- **API-First Development**: Schema-driven development with automatic endpoint generation
- **Microservices**: Ultra-lightweight service development with observer-based extensibility
- **High-Performance APIs**: Maximum performance with minimal resource overhead
- **Multi-Tenant Systems**: Enterprise-grade tenant isolation and security

### Technology Stack
- **[Hono](https://hono.dev/)**: Ultra-fast web framework with multi-runtime support
- **TypeScript**: Type-safe development with modern language features
- **PostgreSQL**: Advanced multi-tenant database architecture

**Complete Stack**: See [DEVELOPER.md](DEVELOPER.md) for detailed technology specifications

### Archive Value
Excellent reference for modern TypeScript API development, multi-tenant architecture, schema-first development, observer patterns, and high-performance API design.

---

## Next Steps

**🚀 Quick Start**: Follow the installation guide above to get Monk API running.

**📚 Deep Dive**: For comprehensive technical documentation, architecture details, development workflows, and advanced features, see **[DEVELOPER.md](DEVELOPER.md)**.

**🔍 API Reference**: For complete endpoint documentation and usage examples, see **[src/routes/docs/PUBLIC.md](src/routes/docs/PUBLIC.md)**.

Happy coding! 🎯

---

## Documentation

### Quick Start
- **[INSTALL.md](INSTALL.md)** - Installation, setup, and quick start guide

### Development
- **[DEVELOPER.md](DEVELOPER.md)** - Comprehensive developer guide and architecture
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Systematic debugging and issue resolution
- **[spec/README.md](spec/README.md)** - Testing guide and common commands

### Testing Status
- **✅ Shell Tests**: Comprehensive end-to-end integration tests
- **🚧 TypeScript Tests**: Planned unit tests (Vitest)
- **📋 Coverage**: Complete API and workflow validation

**Testing Guide**: See [spec/README.md](spec/README.md) for comprehensive testing strategies

### API Reference
- **[Live API Docs](src/routes/docs/PUBLIC.md)** - Auto-generated API documentation
