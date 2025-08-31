# Monk API

## Executive Summary

**Modern PaaS Backend Framework** - Ultra-lightweight Platform-as-a-Service API built with Hono and TypeScript, featuring schema-first development, multi-tenant architecture, and ring-based observer system for building high-performance SaaS applications.

### Project Overview
- **Language**: TypeScript with Hono ultra-fast web framework
- **Purpose**: Lightweight PaaS backend for rapid SaaS application development
- **Architecture**: Schema-first development with ring-based observer pattern
- **Database**: Multi-tenant PostgreSQL with automatic tenant routing
- **Performance**: 15x faster schema access, ultra-lightweight framework (~50KB)

### Key Features
- **Schema-First Development**: JSON-based data model definitions with JSON Schema validation
- **Multi-Tenant Architecture**: Automatic tenant isolation with dedicated database instances
- **Ring-Based Observer System**: Sophisticated event-driven business logic (0-9 execution rings)
- **Ultra-Fast Performance**: Hono framework with multi-runtime support (Node.js, Bun, Deno, Cloudflare Workers)
- **RESTful API**: Automatic REST endpoint generation from schema definitions
- **Comprehensive Testing**: Isolated test environments with shell script and TypeScript integration

### Technical Architecture
- **Modern Framework Stack**:
  - **Hono Web Framework**: Ultra-fast TypeScript-first web framework (~50KB)
  - **AJV**: High-performance JSON Schema validation
  - **PostgreSQL**: Multi-tenant database with advanced features
  - **TypeScript**: Full type safety and modern development patterns
- **Observer System**: Ring-based execution model for predictable business logic flow
- **CLI Integration**: Complete management via monk-cli standalone tool

### Ring-Based Observer Architecture
**Execution Rings (0-9)**:
- **Ring 0**: Input validation and sanitization
- **Ring 2**: Business logic and rules enforcement
- **Ring 5**: Database execution (SQL operations)
- **Ring 7**: Audit logging and change tracking
- **Ring 8**: Webhooks and external integrations

### Multi-Tenant Capabilities
- **Database Isolation**: Each tenant receives dedicated PostgreSQL database (`tenant_12345678`)
- **JWT-Based Routing**: Automatic tenant detection and database routing via JWT tokens
- **Schema Independence**: Tenants can evolve schemas independently without interference
- **Performance Optimization**: SHA256 caching provides 15x faster schema access
- **Resource Efficiency**: Ultra-lightweight framework minimizes resource overhead per tenant

### Schema-First Development
```json
# Example: user.json schema definition
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

### API Design Patterns
**Consistent Array/Object Patterns**:
```bash
GET  /api/data/users      # List all users (array response)
POST /api/data/users      # Create users - bulk operations (array input)
GET  /api/data/users/123  # Get specific user (object response)
PUT  /api/data/users/123  # Update specific user (object input)
```

### Development Features
- **Hot Reload**: Development server with automatic TypeScript compilation and reload
- **CLI Management**: Complete API management via monk-cli tool
- **Docker Support**: Complete containerization with development and production configurations
- **Testing Framework**: Comprehensive test suite with both TypeScript and shell script coverage
- **Multi-Runtime**: Support for Node.js, Bun, Deno, and Cloudflare Workers

### Performance Optimizations
- **Ultra-Lightweight**: ~50KB Hono framework vs traditional heavy frameworks
- **Schema Caching**: 15x performance improvement with SHA256-based caching
- **Raw SQL Performance**: Direct SQL execution without ORM overhead
- **Multi-Runtime**: Deploy to fastest available JavaScript runtime
- **Connection Pooling**: Efficient database connection management

### Enterprise Features
- **Security**: Built-in authentication, authorization, and JWT-based tenant routing
- **Observability**: Comprehensive logging, error tracking, and audit trails
- **Scalability**: Horizontal scaling through tenant distribution and lightweight architecture
- **Testing**: Isolated test environments with comprehensive coverage
- **Documentation**: Extensive developer documentation and implementation guides

### CLI Integration
Complete API management via **monk-cli**:
```bash
monk tenant create my-app     # Create new tenant
monk auth login my-app root   # Authenticate with tenant
monk meta create schema       # Create schema from JSON
monk data create user         # Create user records
```

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
- **AJV**: High-performance JSON Schema validation
- **JSON Schema**: Schema definition, validation, and automatic documentation

### Archive Value
Excellent reference for:
- **Modern TypeScript API Development**: Current best practices with ultra-fast frameworks
- **Multi-Tenant Architecture**: Advanced tenant isolation and database routing patterns
- **Schema-First Development**: JSON-driven development with automatic API generation
- **Observer Pattern**: Ring-based event-driven architecture in TypeScript
- **High-Performance API Design**: Ultra-lightweight framework patterns and optimization techniques

Essential example of modern, high-performance backend development combining cutting-edge TypeScript frameworks, schema-driven development, and sophisticated multi-tenant architecture for scalable SaaS platforms.

---

## Documentation

### Quick Start
- **[docs/INSTALL.md](docs/INSTALL.md)** - Installation, setup, and quick start guide
- **[docs/TESTING.md](docs/TESTING.md)** - Testing guide and common commands

### Development
- **[docs/DEVELOPER.md](docs/DEVELOPER.md)** - Comprehensive developer guide and architecture
- **[docs/OBSERVERS.md](docs/OBSERVERS.md)** - Observer system development guide
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Systematic debugging and issue resolution

### API Reference
- **[docs/API.md](docs/API.md)** - Complete API endpoints, patterns, and examples
- **[docs/FILTER.md](docs/FILTER.md)** - Advanced filter system with 25+ operators
- **[docs/FTP.md](docs/FTP.md)** - FTP middleware filesystem-like interface

### Technical Specifications
- **[docs/SPEC.md](docs/SPEC.md)** - Complete test specification and architecture
