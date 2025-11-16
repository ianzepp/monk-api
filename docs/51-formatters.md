# Response Format API

The Monk API supports multiple response formats to optimize for different use cases, from human readability to token efficiency for LLM integrations.

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

### Brainfuck (Response-Only)
Converts JSON responses to Brainfuck code that outputs the JSON string when executed. Completely impractical but technically fascinating.

**Request:**
```bash
curl http://localhost:9001/auth/tenants?format=brainfuck > output.bf
brainfuck output.bf  # Executes and outputs JSON
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

**Note:** QR code decoding for request bodies is intentionally not supported.

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

| Format | Request Support | Response Support |
|--------|----------------|------------------|
| JSON | ✓ | ✓ |
| TOON | ✓ | ✓ |
| YAML | ✓ | ✓ |
| Brainfuck | ✗ | ✓ |
| Morse | ✓ | ✓ |
| QR Code | ✗ | ✓ |

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

### TOON
- LLM applications (reduced token usage)
- Chat interfaces
- AI agents

### YAML
- Configuration management
- Human-readable exports
- Documentation examples

### Brainfuck
- Novelty applications
- Educational demonstrations
- Because we can

### Morse Code
- Ham radio integrations
- Accessibility applications
- Educational/novelty use

### QR Code
- Mobile device access (scan with phone camera)
- Screen sharing / presentations
- Air-gapped data transfer
- Terminal-based workflows
- Quick data sharing without copy/paste

## Implementation Details

All format handling is implemented in:
- **Formatters**: `src/lib/formatters/` - Encoding/decoding logic
- **Middleware**: `src/lib/middleware/response-formatter.ts` - Response formatting
- **Middleware**: `src/lib/middleware/request-body-parser.ts` - Request parsing
- **Detection**: `src/lib/middleware/format-detection.ts` - Format selection

## Testing

Format functionality is tested in `spec/51-formatters/`:
- `format-toon.test.sh`
- `format-yaml.test.sh`
- `format-morse.test.sh`
