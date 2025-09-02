# Neon Integration Scripts

This directory contains utilities for integrating monk-api with [Neon](https://neon.tech) PostgreSQL.

## Overview

Neon is a serverless PostgreSQL platform that provides:
- PostgreSQL 17 compatibility
- Automatic scaling and connection pooling
- Database branching for development workflows
- Integration with Vercel and other platforms

## Scripts

### Connection Testing
- **`test-neon-connection.js`** - Basic Neon connectivity test
- **`test-monk-neon.js`** - Test monk-api DatabaseConnection class with Neon

### Database Setup
- **`create-monk-main-db.js`** - Creates the `monk_main` database on Neon

## Usage

All scripts use the standard `.env` file (via dotenv). To use Neon, ensure your `.env` points to Neon configuration:

**Setup `.env.neon` with your Neon credentials:**
```bash
DATABASE_URL=postgresql://username:password@host/database?sslmode=require&channel_binding=require
```

**Activate Neon environment:**
```bash
ln -sf .env.neon .env
```

Run scripts from project root:

```bash
# Test basic connection
node vendors/neon/test-neon-connection.js

# Test monk-api integration
node vendors/neon/test-monk-neon.js

# Create monk_main database
node vendors/neon/create-monk-main-db.js
```

## Environment Management

- `.env.local` - Local PostgreSQL configuration (backup)
- `.env.neon` - Neon configuration 
- `.env` - Symlink to active configuration

Switch environments:
```bash
# Use Neon
ln -sf .env.neon .env

# Use local PostgreSQL  
ln -sf .env.local .env
```

## Deployment

These scripts are useful for:
- Initial Neon database setup
- CI/CD pipeline database initialization
- Vercel deployment preparation
- Development environment switching

## Security

⚠️ **Important**: These scripts contain database connection strings and are excluded from git via `.gitignore`. Never commit files with credentials.