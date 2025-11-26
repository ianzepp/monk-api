#!/bin/bash
# Build standalone Monk API distribution
#
# Creates a single executable using Bun's compile feature.
# The resulting binary includes all dependencies and can run with just:
#   DATABASE_URL=sqlite:root ./monk-api
#
# Output: dist-standalone/monk-api (or monk-api.exe on Windows)

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Building Standalone Monk API ===${NC}"
echo ""

# 1. Ensure TypeScript is compiled
echo -e "${BLUE}[1/4] Compiling TypeScript...${NC}"
npm run build

# 2. Create output directory
echo -e "${BLUE}[2/4] Preparing output directory...${NC}"
mkdir -p dist-standalone

# 3. Copy fixtures (needed at runtime for initialization)
echo -e "${BLUE}[3/4] Copying fixtures...${NC}"
cp -r fixtures dist-standalone/

# 4. Compile to single executable
echo -e "${BLUE}[4/4] Compiling to standalone binary...${NC}"
bun build \
    --compile \
    --minify \
    --sourcemap \
    --external @aws-sdk/client-s3 \
    --external better-sqlite3 \
    ./dist/index.js \
    --outfile dist-standalone/monk-api

# Get file size
SIZE=$(du -h dist-standalone/monk-api | cut -f1)

echo ""
echo -e "${GREEN}=== Build Complete ===${NC}"
echo ""
echo "Output: dist-standalone/monk-api ($SIZE)"
echo ""
echo "Usage (zero-config):"
echo "  cd dist-standalone"
echo "  ./monk-api"
echo ""
echo "The server will:"
echo "  - Default to DATABASE_URL=sqlite:root (no config needed)"
echo "  - Auto-create SQLite database in .data/db_main/root.db"
echo "  - Create root user (login: root)"
echo "  - Listen on port 9001"
echo ""
echo "Override defaults with environment variables:"
echo "  DATABASE_URL=sqlite:myapp ./monk-api      # Different tenant name"
echo "  PORT=8080 ./monk-api                       # Different port"
echo ""
echo "Test with:"
echo "  curl -X POST http://localhost:9001/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"tenant\":\"root\",\"username\":\"root\"}'"
