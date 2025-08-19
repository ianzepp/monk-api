# Metadata Schema Definitions

This directory contains common schema definitions in JSON Schema YAML format that can be used to bootstrap typical PaaS applications.

## Available Schemas

### `account.yaml`
Business or organizational accounts with contact information, industry classification, and status management.

**Key Fields:**
- `name` (required): Account/business name
- `email`: Primary contact email
- `phone`, `website`: Contact information
- `industry`: Business sector
- `status`: active/inactive/suspended

### `contact.yaml`  
Individual contacts associated with accounts, supporting typical CRM functionality.

**Key Fields:**
- `first_name`, `last_name` (required): Contact name
- `email`, `phone`: Contact information
- `title`: Job title/position
- `account_id`: Foreign key to accounts table
- `is_primary`: Primary contact flag
- `status`: active/inactive

### `user.yaml`
System user accounts for authentication and authorization with multi-tenant support.

**Key Fields:**
- `username`, `email` (required): Login credentials
- `first_name`, `last_name` (required): User identity
- `password_hash`: Secure password storage
- `role`: admin/user/viewer authorization levels
- `is_active`, `email_verified`: Account status
- `account_id`: Optional multi-tenant association

## Usage

These schemas can be loaded via the meta API:

```bash
# Create account schema
cat src/metadata/account.yaml | ./monk meta create schema -

# Create contact schema  
cat src/metadata/contact.yaml | ./monk meta create schema -

# Create user schema
cat src/metadata/user.yaml | ./monk meta create schema -
```

Or imported programmatically for application initialization.

## Schema Features

- **Foreign Key Relationships**: Proper referential integrity with cascade delete
- **Data Validation**: Comprehensive field validation (email, UUID, enum, pattern matching)
- **Sensible Defaults**: Common default values for status fields
- **Multi-tenant Ready**: Namespace isolation and ACL support built-in
- **Extensible**: Easy to modify or extend for specific use cases