# 21-formatters: Response Formatting

**Priority**: CRITICAL
**Coverage**: 95% (Excellent)
**Status**: Comprehensive coverage of all major formats

## Critical / Smoke Tests

### Existing Tests (2 TypeScript files, comprehensive coverage)
- Response format negotiation (JSON, YAML, TOON) (format-response.test.ts)
- Format priority handling (?format= parameter vs Accept header)
- Field extraction (?unwrap parameter) (field-extraction.test.ts)
- Field selection (?select= parameter) (field-extraction.test.ts)
- Default format behavior (JSON)

## Additional Tests

### Comprehensive Coverage Includes
- JSON format (default, most important)
- YAML format (human-readable, important for CLI)
- TOON format (TypeScript Object Notation, important for developer tools)
- Content-Type header validation
- Accept header negotiation
- Query parameter override behavior
- Field unwrapping for nested objects
- Field selection with dot notation
- Array field handling

### Missing Tests (1 minor)
- Morse format implementation (marked as TODO in tests)

## Notes

- Well-tested with TypeScript/Vitest
- JSON, YAML, and TOON are the critical formats for production
- Morse format is experimental/non-critical
- Field extraction tests cover ?unwrap and ?select parameters
- Format priority tests ensure correct precedence (?format > Accept header > default)
- Critical for CLI tool which uses YAML/TOON for human-readable output
