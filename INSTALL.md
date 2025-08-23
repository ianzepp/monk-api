# Monk API Installation Guide

## Prerequisites

### System Requirements
- **Node.js**: Version 18.0.0 or higher
- **npm**: Comes with Node.js
- **Git**: For repository management
- **PostgreSQL**: Database server and client tools
- **jq**: JSON processor for CLI configuration management
- **Bash**: Version 4.2 or higher (usually available on Linux/macOS)

### Install PostgreSQL

#### Ubuntu/Debian:
```bash
# Using official PostgreSQL repository (recommended)
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo tee /usr/share/keyrings/postgresql-archive-keyring.asc > /dev/null
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/postgresql-archive-keyring.asc] http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install postgresql postgresql-client postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create PostgreSQL user
sudo -u postgres psql -c "CREATE USER $(whoami) WITH SUPERUSER;"
```

#### macOS (Homebrew):
```bash
brew install postgresql
brew services start postgresql
```

#### Other Systems:
Visit [PostgreSQL Downloads](https://www.postgresql.org/download/) for your platform.

### Install jq

#### Ubuntu/Debian:
```bash
sudo apt install jq
```

#### macOS (Homebrew):
```bash
brew install jq
```

#### Other Systems:
Visit [jq Downloads](https://jqlang.github.io/jq/download/) for your platform.

## Installation Steps

**Quick Setup:** For automated installation, run `npm run autoinstall` after cloning and installing PostgreSQL. This script automates all the steps below with comprehensive logging and error checking.

**Clean Options:** The autoinstall script supports clean rebuild options:
- `npm run autoinstall -- --clean-node` - Remove and reinstall dependencies
- `npm run autoinstall -- --clean-dist` - Remove and recompile TypeScript  
- `npm run autoinstall -- --clean-auth` - Remove and recreate auth database

**Manual Setup:** Follow the steps below for manual installation or if you prefer to understand each step:

### 1. Clone and Setup Repository
```bash
# Clone the repository
git clone git@github.com:ianzepp/monk-api.git
cd monk-api

# Install dependencies
npm install

# Compile TypeScript
npm run compile
```

### 2. Verify PostgreSQL Connection
Before proceeding, ensure PostgreSQL is properly configured:
```bash
# Test basic connection (this must work first)
psql -d postgres -c "SELECT version();"

# Should show PostgreSQL version info
# If this fails, configure your PostgreSQL authentication first
```

### 3. Configure Database Connection
Create `.env` file with your PostgreSQL connection details:
```bash
# Copy example configuration
cp .env.example .env

# Edit .env file with your PostgreSQL credentials
# DATABASE_URL=postgresql://your_username:your_password@localhost:5432/
```

**Example for local development:**
```bash
echo "DATABASE_URL=postgresql://$(whoami):$(whoami)@localhost:5432/" > .env
```

### 4. Initialize Auth Database
```bash
# Create and initialize auth database
createdb monk-api-auth
psql -d monk-api-auth -f sql/init-auth.sql
```

### 5. Configure Server
```bash
# Add local server configuration
./bin/monk servers add local localhost:9001

# Verify configuration
./bin/monk servers list
```

### 6. Create Test Tenant
```bash
# Create a test tenant
./bin/monk tenant create local-test

# Verify tenant creation
./bin/monk tenant list
```

### 7. Start the Server
```bash
# Start in development mode (with auto-reload)
npm run start:dev

# Or start in production mode
npm run start
```

### 8. Test Connection
```bash
# Test server connectivity
./bin/monk ping

# Expected output: pong: [timestamp]
```

## Fresh Install Issues & Solutions

### Issue 1: Missing Server Configuration
- **Problem**: CLI requires server configuration before first use
- **Solution**: Run `./bin/monk servers add local localhost:9001`
- **Auto-fix**: CLI guides you through this on first run

### Issue 2: PostgreSQL Dependencies
- **Problem**: Missing PostgreSQL server and client tools
- **Symptoms**: 
  - `monk tenant create` fails with "psql: command not found"
  - Unit tests fail with "connect ECONNREFUSED 127.0.0.1:5432"
  - Authentication errors (system-dependent):
    - `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` (Official PostgreSQL repo)
    - `fe_sendauth: no password supplied` (Password required)
    - `FATAL: Ident authentication failed for user "username"` (Ubuntu peer auth)
    - `FATAL: password authentication failed for user "username"` (Wrong password)
    - `FATAL: role "username" does not exist` (User doesn't exist)
- **Solution**: Install PostgreSQL and ensure you can connect with `psql -d postgres -c "SELECT version();"`

### Issue 3: Missing Auth Database
- **Problem**: Fresh install doesn't have auth database initialized
- **Solution**: Create and initialize with provided SQL script:
  ```bash
  createdb monk-api-auth
  psql -d monk-api-auth -f sql/init-auth.sql
  ```

### Issue 4: Authentication Setup
After PostgreSQL is installed and running:
```bash
# Create tenant database
./bin/monk tenant create local-test

# Login with default credentials
./bin/monk auth login local-test root

# Check authentication status
./bin/monk auth status
```

## Testing

### Shell Tests (Primary)
The shell-based test suite covers groups 00-30:

```bash
# Test specific groups (recommended for fresh install verification)
npm run test:one tests/05-infrastructure/servers-config-test.sh
npm run test:one tests/10-connection/ping-test.sh
npm run test:one tests/20-meta-api/schema-crud-test.sh
```

Expected to pass: All tests in groups 00-30 (setup, infrastructure, connection, meta API, data API)

### Unit Tests (Secondary)
```bash
# Run TypeScript unit tests (requires PostgreSQL)
npm run test:unit
```

**Note**: `npm run test` (full test suite) is currently broken and will be fixed in a separate branch.

## Development Workflow

### Local Development
```bash
# Start server with auto-reload
npm run start:dev

# In another terminal, interact with API
./bin/monk auth login local-test root
./bin/monk meta list schema
./bin/monk data list some_schema
```

### Testing Changes
```bash
# Test specific functionality
npm run test:one tests/20-meta-api/schema-crud-test.sh

# Test connection and basic functionality
./bin/monk ping
./bin/monk auth status
```

## Troubleshooting

### PostgreSQL Connection Issues
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# If not running, start it:
# Ubuntu/Debian: sudo systemctl start postgresql
# macOS: brew services start postgresql
```

### CLI Issues
```bash
# Check monk CLI is working
./bin/monk --help

# Check server configuration
./bin/monk servers list

# Re-add server if needed
./bin/monk servers add local localhost:9001
```

### Permission Issues
```bash
# Make sure monk CLI is executable
chmod +x ./bin/monk
chmod +x ./cli/monk
```

## Next Steps

After successful installation:
1. ✅ Server running and responding to ping
2. ✅ PostgreSQL installed and running  
3. ✅ Auth database initialized
4. ✅ Tenant created and authenticated
5. ✅ Shell tests 00-30 passing
6. → Ready for development and feature work

For development patterns and API usage, see `CLAUDE.md` and `README.md`.