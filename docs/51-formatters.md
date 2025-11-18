# Response Format & Field Extraction API

The Monk API supports multiple response formats to optimize for different use cases, from human readability to token efficiency for LLM integrations. Additionally, server-side field extraction eliminates the need for client-side `jq` piping in test scripts.

## Quick Examples

### Format Only
```bash
# Get response in TOON format
curl http://localhost:9001/api/auth/whoami?format=toon
```

### Field Extraction Only
```bash
# Extract single field (returns plain text)
curl http://localhost:9001/api/auth/whoami?select=id
→ c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c

# Extract multiple fields (returns JSON object)
curl http://localhost:9001/api/auth/whoami?select=id,name
→ {"id":"c81d0a9b...","name":"Demo User"}
```

### Combined: Extract + Format
```bash
# Extract fields THEN format as TOON
curl http://localhost:9001/api/auth/whoami?select=id,name&format=toon
→ id: c81d0a9b...
  name: Demo User
```

## Supported Formats

### JSON (Default)
Standard JSON format with 2-space indentation.

**Request:**
```bash
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant":"toon-test","username":"root"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "user": {...}
  }
}
```

**With Field Extraction:**
```bash
curl http://localhost:9001/auth/login?select=token \
  -d '{"tenant":"demo","username":"root"}'
→ eyJhbGc... (plain text token)
```

### TOON
Compact, human-readable format designed for reduced token usage in LLM applications.

**Request:**
```bash
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/toon" \
  -H "Accept: application/toon" \
  -d 'tenant: toon-test
username: root'
```

**Response:**
```toon
success: true
data:
  token: eyJhbGc...
  user:
    ...
```

**With Field Extraction:**
```bash
curl http://localhost:9001/api/auth/whoami?select=id,access&format=toon
→ id: c81d0a9b...
  access: root
```

### YAML
Standard YAML format for human readability and compatibility.

**Request:**
```bash
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/yaml" \
  -H "Accept: application/yaml" \
  -d 'tenant: toon-test
username: root'
```

**Response:**
```yaml
success: true
data:
  token: eyJhbGc...
  user:
    ...
```

**With Field Extraction:**
```bash
curl http://localhost:9001/api/auth/whoami?select=access_read,access_edit&format=yaml
→ access_read: []
  access_edit: []
```

### Brainfuck (Response-Only)
Converts JSON responses to Brainfuck code that outputs the JSON string when executed. Completely impractical but technically fascinating.

**Request:**
```bash
curl http://localhost:9001/auth/tenants?format=brainfuck > output.bf
brainfuck output.bf  # Executes and outputs JSON
```

**With Field Extraction:**
```bash
# Extract single field, then convert to Brainfuck
curl http://localhost:9001/auth/tenants?select=[0].name&format=brainfuck > tenant.bf
```

**Note:** Brainfuck decoding for request bodies is intentionally not supported.

### Morse Code
Converts JSON to/from Morse code (dots and dashes). Uses hex encoding internally to preserve case sensitivity.

**Request:**
```bash
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/morse" \
  -H "Accept: application/morse" \
  -d '--... -... ..--- ..--- --... ....- ...'
```

**Response:**
```
--... -... ----- .- ..--- ----- ..--- ----- ..--- ..--- --... ...-- ...
```

**How it works:**
1. JSON → Hex encoding (preserves case, only 0-9 A-F)
2. Hex → Morse code (dots and dashes)
3. Morse → Hex → JSON (perfect round-trip)

**With Field Extraction:**
```bash
# Extract field and return as Morse code
curl http://localhost:9001/api/auth/whoami?select=name&format=morse
```

### QR Code (Response-Only)
Generates scannable ASCII art QR codes from JSON responses. Perfect for mobile access and air-gapped data transfer.

**Request:**
```bash
curl http://localhost:9001/auth/tenants?format=qr
```

**Response:**
```
█████████████████████████████████████████
██ ▄▄▄▄▄ █▀ ▀█▀  ▀▄█ ▄█▀  ▀▀▄▄█  █▄▀ ▄▄▀██
██ █   █ ██▀█▀▀█ ██   █▀█ ▀▄▄██▀▄██ ▄▄▄██
██ █▄▄▄█ █▄▄  ▀▄▀▄█ ██▀▀█▀ ▄▄▄ ▀ ▀█  ▀▄ ██
██▄▄▄▄▄▄▄█▄█ ▀▄▀▄█ ▀ █ ▀▄▀ █▄█ ▀▄▀ █ ▀ ███
...
```

**Features:**
- Scannable with any QR code reader app
- Medium error correction for reliability
- Unicode block characters (█ ▀ ▄) for high contrast
- Works in terminals and text displays

**With Field Extraction:**
```bash
# Generate QR code of just the token
curl http://localhost:9001/auth/login?select=token&format=qr \
  -d '{"tenant":"demo","username":"root"}'
```

**Note:** QR code decoding for request bodies is intentionally not supported.

### Markdown (Response-Only)
Converts JSON responses to readable Markdown with tables, lists, and structured formatting. Perfect for documentation and terminal display.

**Request:**
```bash
curl http://localhost:9001/auth/tenants?format=markdown
```

**Response:**
```markdown
# API Response

**Status**: ✓ Success

## Data

| name | description | users |
| --- | --- | --- |
| toon-test |  | ["root","full","user"] |
```

**Features:**
- Arrays of objects → Markdown tables
- Single objects → Key-value lists with bold labels
- Nested structures → Indented sections
- API responses → Status headers with ✓/✗ symbols
- GitHub-compatible output

**With Field Extraction:**
```bash
# Extract nested object and format as Markdown table
curl http://localhost:9001/api/describe?unwrap&format=markdown
```

**Note:** Markdown decoding is not supported as it's a presentation format, not a data serialization format.

## Field Extraction (`?unwrap` and `?select=`)

Server-side field extraction eliminates the need for `curl | jq` piping in test scripts and automation.

### Modes

**No Parameters (Full Envelope):**
```bash
GET /api/auth/whoami
→ {"success": true, "data": {"id": "...", "name": "...", ...}}
```

**Unwrap (Remove Envelope):**
```bash
?unwrap                          # Returns full data object without envelope
```

**Select Fields (Remove Envelope + Filter):**
```bash
?select=id                       # Returns single field value
?select=id,name                  # Returns JSON object with selected fields
?select=user.email               # Nested path support
```

### Examples

**Before (with jq):**
```bash
# Unwrap data object
curl /api/auth/whoami | jq -r '.data'

# Extract single field
curl /api/auth/whoami | jq -r '.data.id'

# Extract multiple fields
curl /api/auth/whoami | jq '{id: .data.id, name: .data.name}'
```

**After (with ?unwrap and ?select=):**
```bash
# Unwrap data object (no envelope)
curl /api/auth/whoami?unwrap
→ {"id":"c81d0a9b...","name":"Demo User","access":"root",...}

# Extract single field (returns plain text)
curl /api/auth/whoami?select=id
→ c81d0a9b-8d9a-4daf-9f45-08eb8bc3805c

# Extract multiple fields (returns JSON object)
curl /api/auth/whoami?select=id,name
→ {"id":"c81d0a9b...","name":"Demo User"}

# Extract and format (one request)
curl /api/auth/whoami?select=id,name&format=toon
→ id: c81d0a9b...
  name: Demo User
```

### Features

- **Three Modes**: Full envelope (default), unwrap (remove envelope), select (filter fields)
- **Nested Paths**: Use dot notation (`.`) to traverse objects: `select=user.email`
- **Multiple Fields**: Comma-separate paths to extract multiple fields: `select=id,name`
- **Implicit Scope**: `?select=` operates within `data` automatically (no need for `data.` prefix)
- **Single Value Return**: Single fields return plain text (no JSON wrapping)
- **Multiple Value Return**: Multiple fields return JSON object
- **Graceful Handling**: Missing fields return `null`/`undefined`
- **Format Compatible**: Works with all response formats (JSON, TOON, YAML, etc.)
- **Shell-Safe**: No special characters requiring quotes in URLs
- **Transparent**: Routes are unaware of extraction - happens at API boundary

### Use Cases

**Test Scripts:**
```bash
# Get unwrapped user data
USER_DATA=$(curl /api/auth/whoami?unwrap)

# Get just the token for subsequent requests
TOKEN=$(curl /auth/login?select=token -d '{"tenant":"demo","username":"root"}')

# Verify specific field value
USER_ACCESS=$(curl /api/auth/whoami?select=access)
[[ "$USER_ACCESS" == "root" ]] && echo "Admin access confirmed"
```

**CI/CD Pipelines:**
```bash
# Get unwrapped data for processing
curl /api/describe?unwrap | jq 'length'

# Get database name for backup scripts
DB_NAME=$(curl /api/auth/whoami?select=database)
backup-database "$DB_NAME"
```

**Development/Debugging:**
```bash
# Quick field inspection without jq
curl /api/data/users/123?select=email

# Compare fields across formats
curl /api/auth/whoami?select=id,name&format=toon
curl /api/auth/whoami?select=id,name&format=yaml

# Get full data without envelope
curl /api/data/users/123?unwrap
```

## Format Selection

Formats can be specified in three ways (in priority order):

### 1. Query Parameter
```bash
curl http://localhost:9001/auth/tenants?format=toon
```

### 2. Accept Header
```bash
curl http://localhost:9001/auth/tenants \
  -H "Accept: application/toon"
```

### 3. JWT Format Preference
Specify format during login and it will be stored in your JWT token:
```bash
curl -X POST http://localhost:9001/auth/login \
  -d '{"tenant":"toon-test","username":"root","format":"toon"}'
```

All subsequent requests with that JWT will default to TOON format.

## Bidirectional Support

| Format | Request Support | Response Support | Field Extraction |
|--------|----------------|------------------|------------------|
| JSON | ✓ | ✓ | ✓ |
| TOON | ✓ | ✓ | ✓ |
| YAML | ✓ | ✓ | ✓ |
| Brainfuck | ✗ | ✓ | ✓ |
| Morse | ✓ | ✓ | ✓ |
| QR Code | ✗ | ✓ | ✓ |
| Markdown | ✗ | ✓ | ✓ |

**Note:** Field extraction works with all response formats - data is extracted first (from JSON), then formatted.

## Content-Type Headers

Request bodies must specify the correct Content-Type header:

- JSON: `application/json`
- TOON: `application/toon` or `text/plain`
- YAML: `application/yaml` or `text/yaml`
- Morse: `application/morse` or `text/plain` (with morse pattern)

## Use Cases

### JSON
- Standard REST API clients
- Web applications
- Mobile apps
- Default format for all endpoints

### TOON
- LLM applications (reduced token usage ~30-40%)
- Chat interfaces
- AI agents
- Claude Code API interactions

### YAML
- Configuration management
- Human-readable exports
- Documentation examples
- CI/CD pipeline data

### Brainfuck
- Novelty applications
- Educational demonstrations
- Esoteric programming challenges
- Because we can

### Morse Code
- Ham radio integrations
- Accessibility applications
- Educational/novelty use
- Audio transmission scenarios

### QR Code
- Mobile device access (scan with phone camera)
- Screen sharing / presentations
- Air-gapped data transfer
- Terminal-based workflows
- Quick data sharing without copy/paste
- Token distribution via QR scan

### Markdown
- API documentation generation
- GitHub issues and pull requests
- Terminal-friendly output (`curl | less`)
- Copy/paste into documentation
- Report generation
- Human-readable exports

### Field Extraction (`?select=`)
- **Test Scripts**: Eliminate `| jq` piping
- **CI/CD**: Extract specific values for automation
- **Debugging**: Quick field inspection
- **Token Extraction**: Get auth tokens directly
- **Data Validation**: Check specific field values
- **Bandwidth Optimization**: Return only needed fields

## Implementation Details

All format and extraction handling is implemented in:

**Field Extraction:**
- `src/lib/field-extractor.ts` - Lightweight dot-notation utility (~100 lines, no dependencies)
- `src/lib/middleware/field-extraction.ts` - Middleware for direct `context.json()` routes
- `src/lib/middleware/system-context.ts` - Integrated extraction for `setRouteResult()` routes

**Format Handling:**
- `src/lib/formatters/` - Encoding/decoding logic for each format
  - `json.ts` - Standard JSON (default)
  - `toon.ts` - Compact TOON format
  - `yaml.ts` - YAML format
  - `brainfuck.ts` - Brainfuck encoding (response-only)
  - `morse.ts` - Morse code encoding/decoding
  - `qr.ts` - QR code ASCII art (response-only)
  - `markdown.ts` - Markdown formatting (response-only)

**Middleware Pipeline:**
- `src/lib/middleware/response-formatter.ts` - Response formatting via `context.json()` override
- `src/lib/middleware/request-body-parser.ts` - Request parsing (TOON/YAML/Morse → JSON)
- `src/lib/middleware/format-detection.ts` - Format selection (query param → header → JWT)

**Processing Order:**
1. **Request**: `request-body-parser` decodes TOON/YAML/Morse → JSON
2. **Route Logic**: Works with JSON objects (format-agnostic)
3. **Field Extraction**: Extracts specified fields if `?select=` present
4. **Response Formatting**: Encodes JSON → TOON/YAML/Morse/etc if requested

## Architecture Principles

### Transparent at API Boundary
Routes always work with JSON objects - formatters and extraction operate transparently:
```typescript
// Route handler - always works with JSON
export default async function(context: Context) {
    return context.json({
        success: true,
        data: { id: "123", name: "Test" }
    });
}

// Formatters handle encoding at boundary:
// - ?format=toon → encodes to TOON
// - ?select=id → extracts field first
// - ?select=id&format=toon → extracts then encodes
```

### No Dependencies
Field extraction is implemented without external libraries:
- Simple dot-notation parser (~30 lines)
- Recursive object traversal
- Graceful null/undefined handling

### Performance
- Default format (JSON) has zero overhead
- Format detection is a simple query param check
- Field extraction only runs when `?select=` is present
- Formatters are lazy-loaded and cached

## Testing

Format and extraction functionality is tested in:

**Format Tests:**
- `spec/51-formatters/format-toon.test.sh` - TOON encoding/decoding
- `spec/51-formatters/format-yaml.test.sh` - YAML encoding/decoding
- `spec/51-formatters/format-morse.test.sh` - Morse code encoding/decoding

**Extraction Tests:**
- `spec/10-auth/whoami.test.sh` - Single/multiple field extraction
- Integration tests verify `?select=` work with all formats

**Test Coverage:**
- Single field extraction (returns plain text)
- Multiple field extraction (returns JSON object)
- Nested path extraction (`data.user.email`)
- Missing field handling (returns `null`)
- Format compatibility (`?select=` + `?format=`)
- All supported formatters tested

## monk curl Integration

The `monk curl` command provides simplified access with automatic authentication:

```bash
# Standard request
monk curl GET /api/auth/whoami

# With field extraction
monk curl GET '/api/auth/whoami?select=id'

# With format
monk curl GET '/api/auth/whoami?format=toon'

# Combined
monk curl GET '/api/auth/whoami?select=id,name&format=yaml'
```

The command handles:
- Automatic JWT token injection
- Proper URL encoding
- Pre-configured server/tenant
- Shell escaping (no need to escape `&` in URLs)

## Advanced Examples

### Extract Array Elements
```bash
# Get first tenant name
curl /auth/tenants?select=[0].name
→ demo-01

# Get all tenant names (if data is array of objects)
curl /auth/tenants?unwrap&format=json | jq -r '.[].name'
```

### Chain with jq (When Needed)
```bash
# Extract then transform with jq
curl /api/auth/whoami?unwrap | jq -r '.access'

# Or just extract directly
curl /api/auth/whoami?select=access
```

### Format Comparison
```bash
# Compare same data in different formats
curl /api/auth/whoami?select=id,name
curl /api/auth/whoami?select=id,name&format=toon
curl /api/auth/whoami?select=id,name&format=yaml
curl /api/auth/whoami?select=id,name&format=markdown
```

### Token Usage Optimization
```bash
# Full response (verbose JSON)
curl /api/auth/whoami
→ {"success":true,"data":{"id":"...","name":"...","access":"...","tenant":"...","database":"...","access_read":[],"access_edit":[],"access_full":[]}}

# Extract only needed fields + TOON format (minimal tokens)
curl /api/auth/whoami?select=id,access&format=toon
→ id: c81d0a9b...
  access: root
```

## Error Handling

### Missing Fields
```bash
curl /api/auth/whoami?select=nonexistent
→ null  (graceful)
```

### Invalid Path Syntax
```bash
curl /api/auth/whoami?select=.invalid
→ null  (graceful - treats as missing)
```

### Empty Pick Parameter
```bash
curl /api/auth/whoami?select=
→ (returns full response - extraction skipped)
```

### Extraction with Errors
If extraction fails, the original response is returned with a logged error.

## Migration Guide

### From jq to ?unwrap/?select

**Old Approach:**
```bash
#!/bin/bash
TOKEN=$(curl /auth/login -d '{"tenant":"demo","username":"root"}' | jq -r '.data.token')
USER_ID=$(curl /api/auth/whoami -H "Authorization: Bearer $TOKEN" | jq -r '.data.id')
```

**New Approach:**
```bash
#!/bin/bash
TOKEN=$(curl /auth/login?select=token -d '{"tenant":"demo","username":"root"}')
USER_ID=$(curl /api/auth/whoami?select=id -H "Authorization: Bearer $TOKEN")
```

**Benefits:**
- One less dependency (`jq` not required)
- Faster (server-side extraction)
- Fewer characters
- Less shell escaping issues

## Summary

The Monk API provides a flexible, extensible format system with field extraction:

✅ **7 Formats**: JSON, TOON, YAML, Brainfuck, Morse, QR, Markdown
✅ **Bidirectional**: Request + response support (where applicable)
✅ **Format Detection**: Query param → Accept header → JWT preference
✅ **Field Extraction**: Server-side `?select=` eliminates `| jq` piping
✅ **Transparent**: Routes work with JSON, formatters handle encoding
✅ **No Dependencies**: Lightweight implementation (~320 lines total)
✅ **Fully Tested**: Comprehensive test coverage in `spec/`
✅ **monk curl**: Simplified CLI with automatic authentication

Perfect for LLM integrations, test automation, CI/CD pipelines, and human-readable API exploration.
