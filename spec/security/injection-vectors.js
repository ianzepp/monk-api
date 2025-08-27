/**
 * Comprehensive SQL Injection Attack Vector Library
 *
 * Collection of known SQL injection patterns organized by attack type.
 * Used for systematic security testing across all API endpoints.
 */
/**
 * Classic SQL injection attack patterns
 */
export const CLASSIC_INJECTION_VECTORS = [
    {
        name: 'Basic OR injection',
        payload: "' OR '1'='1",
        category: 'classic',
        description: 'Basic boolean logic injection',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Drop table attack',
        payload: "'; DROP TABLE users; --",
        category: 'classic',
        description: 'Destructive table dropping attempt',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Union select attack',
        payload: "' UNION SELECT * FROM admin --",
        category: 'classic',
        description: 'Data exfiltration via UNION',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Stacked INSERT query',
        payload: "'; INSERT INTO admin VALUES ('hacker', 'admin'); --",
        category: 'classic',
        description: 'Privilege escalation via INSERT',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Comment termination',
        payload: "' --",
        category: 'classic',
        description: 'Comment out remaining query',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Multi-line comment',
        payload: "' /* malicious comment */",
        category: 'classic',
        description: 'Multi-line comment injection',
        expectedBehavior: 'safe_storage'
    }
];
/**
 * PostgreSQL-specific injection vectors
 */
export const POSTGRESQL_INJECTION_VECTORS = [
    {
        name: 'PostgreSQL version disclosure',
        payload: "'; SELECT version(); --",
        category: 'postgresql',
        description: 'PostgreSQL version information disclosure',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Current user disclosure',
        payload: "'; SELECT current_user; --",
        category: 'postgresql',
        description: 'Database user information disclosure',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Database name disclosure',
        payload: "'; SELECT current_database(); --",
        category: 'postgresql',
        description: 'Database name information disclosure',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Sleep injection',
        payload: "'; SELECT pg_sleep(5); --",
        category: 'postgresql',
        description: 'Time-based injection via pg_sleep',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Array unnest attack',
        payload: "'; SELECT unnest(ARRAY[1,2,3]); --",
        category: 'postgresql',
        description: 'PostgreSQL array function injection',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'JSON operator injection',
        payload: "'; SELECT '{\"key\":\"value\"}'::json->'key'; --",
        category: 'postgresql',
        description: 'PostgreSQL JSON operator injection',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Procedural language injection',
        payload: "'; DO $$ BEGIN RAISE NOTICE 'injected'; END $$; --",
        category: 'postgresql',
        description: 'PostgreSQL procedural language injection',
        expectedBehavior: 'safe_storage'
    }
];
/**
 * Advanced injection techniques
 */
export const ADVANCED_INJECTION_VECTORS = [
    {
        name: 'Blind boolean injection',
        payload: "' AND (SELECT SUBSTRING(current_user,1,1))='p",
        category: 'advanced',
        description: 'Blind SQL injection via boolean conditions',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Error-based injection',
        payload: "' AND (SELECT * FROM (SELECT COUNT(*), CONCAT(version(), FLOOR(RAND(0)*2)) x FROM information_schema.tables GROUP BY x) a) --",
        category: 'advanced',
        description: 'Information disclosure via error messages',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Time-based blind injection',
        payload: "' AND IF(1=1, pg_sleep(5), 0) --",
        category: 'advanced',
        description: 'Blind injection via timing attacks',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Conditional injection',
        payload: "' AND IF((SELECT COUNT(*) FROM users)>0, SLEEP(5), 0) --",
        category: 'advanced',
        description: 'Conditional logic exploitation',
        expectedBehavior: 'safe_storage'
    }
];
/**
 * Encoding bypass attempts
 */
export const ENCODING_INJECTION_VECTORS = [
    {
        name: 'URL encoded injection',
        payload: "%27%20OR%20%271%27%3D%271", // ' OR '1'='1
        category: 'encoding',
        description: 'URL encoded SQL injection',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Double URL encoded',
        payload: "%2527%20OR%20%2531%253D%2531", // Double encoded ' OR '1'='1
        category: 'encoding',
        description: 'Double URL encoding bypass attempt',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Unicode injection',
        payload: "\u0027 OR \u00271\u0027=\u00271", // Unicode ' OR '1'='1
        category: 'encoding',
        description: 'Unicode character injection',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Hex encoded injection',
        payload: "0x27204F522027312027203D2027312027", // Hex encoded ' OR '1'='1
        category: 'encoding',
        description: 'Hexadecimal encoding bypass',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Multi-byte character injection',
        payload: "′ OR ′1′=′1", // Using Unicode prime characters instead of apostrophes
        category: 'encoding',
        description: 'Multi-byte character substitution attack',
        expectedBehavior: 'safe_storage'
    }
];
/**
 * Case sensitivity and whitespace evasion
 */
export const EVASION_INJECTION_VECTORS = [
    {
        name: 'Mixed case SELECT',
        payload: "SeLeCt * FrOm users",
        category: 'evasion',
        description: 'Case sensitivity evasion',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Mixed case UNION',
        payload: "uNiOn sElEcT password FROM admin",
        category: 'evasion',
        description: 'Case sensitivity union attack',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Whitespace variations',
        payload: "' \t\n\r OR '1'='1",
        category: 'evasion',
        description: 'Whitespace character evasion',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Comment-based spacing',
        payload: "'/**/OR/**/1=1",
        category: 'evasion',
        description: 'Comment-based whitespace evasion',
        expectedBehavior: 'safe_storage'
    },
    {
        name: 'Tab and newline injection',
        payload: "'\tOR\n'1'='1",
        category: 'evasion',
        description: 'Tab and newline character injection',
        expectedBehavior: 'safe_storage'
    }
];
/**
 * Get all injection vectors combined
 */
export function getAllInjectionVectors() {
    return [
        ...CLASSIC_INJECTION_VECTORS,
        ...POSTGRESQL_INJECTION_VECTORS,
        ...ADVANCED_INJECTION_VECTORS,
        ...ENCODING_INJECTION_VECTORS,
        ...EVASION_INJECTION_VECTORS
    ];
}
/**
 * Get injection vectors by category
 */
export function getInjectionVectorsByCategory(category) {
    return getAllInjectionVectors().filter(vector => vector.category === category);
}
/**
 * Get injection vector categories
 */
export function getInjectionCategories() {
    const allVectors = getAllInjectionVectors();
    return Array.from(new Set(allVectors.map(v => v.category)));
}
/**
 * Common malicious payloads for field testing
 */
export const MALICIOUS_FIELD_PAYLOADS = [
    "'; DROP TABLE schema; --",
    "' OR 1=1 --",
    "'; INSERT INTO admin VALUES ('hacker'); --",
    "' UNION SELECT password FROM users --",
    "'; UPDATE users SET admin = true; --",
    "'; DELETE FROM important_data; --",
    "' AND (SELECT COUNT(*) FROM admin) > 0 --",
    "'; CREATE USER attacker; --",
    "' OR EXISTS(SELECT * FROM users WHERE admin = true) --",
    "'; GRANT ALL PRIVILEGES TO public; --"
];
/**
 * Edge case injection patterns
 */
export const EDGE_CASE_PAYLOADS = [
    "", // Empty string
    null, // Null value
    undefined, // Undefined value
    "   ", // Whitespace only
    "'", // Single quote only
    "''", // Double quotes
    "\\", // Escape character
    "\0", // Null byte
    "\x00", // Hex null byte
    "🚀💥🔥", // Emoji injection
    "very_long_string_that_might_cause_buffer_overflow_issues_" + "x".repeat(1000)
];
//# sourceMappingURL=injection-vectors.js.map