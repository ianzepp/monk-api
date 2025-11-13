import { createHash } from 'crypto';

/**
 * Database Naming Service
 *
 * Centralizes all database name generation logic for tenant databases.
 * This module provides consistent hashing and naming across the application.
 *
 * Current implementation uses SHA256 hashing for enterprise mode, which ensures:
 * - Consistent database names regardless of Unicode variations
 * - Protection from reserved name conflicts
 * - Database name privacy (tenant name not exposed in DB name)
 * - No collision risk (16 hex chars = 64 bits of entropy)
 */

/**
 * Tenant database naming modes
 */
export enum TenantNamingMode {
    /**
     * Enterprise mode: Uses SHA256 hash of tenant name
     * Format: tenant_<16-char-hex>
     * Example: "My Company" → "tenant_a1b2c3d4e5f6789a"
     */
    ENTERPRISE = 'enterprise',

    /**
     * Personal mode: Uses sanitized tenant name directly
     * Format: tenant_<sanitized-name>
     * Example: "monk-irc" → "tenant_monk_irc"
     * (Reserved for Phase 2 implementation)
     */
    PERSONAL = 'personal',
}

/**
 * Database naming service
 *
 * Provides unified database name generation for tenant databases.
 * Replaces duplicate implementations in TenantService and DatabaseTemplate.
 */
export class DatabaseNaming {
    /**
     * Generate tenant database name
     *
     * Supports two modes:
     * - ENTERPRISE: SHA256 hash (tenant_<16-char-hex>) - Default, secure, collision-resistant
     * - PERSONAL: Sanitized tenant name (tenant_<sanitized-name>) - Human-readable, requires uniqueness checks
     *
     * Algorithm (Enterprise Mode):
     * 1. Normalize Unicode input (NFC normalization)
     * 2. Trim whitespace
     * 3. Generate SHA256 hash
     * 4. Take first 16 hex characters
     * 5. Add 'tenant_' prefix
     *
     * Algorithm (Personal Mode):
     * 1. Normalize and trim input
     * 2. Convert to lowercase
     * 3. Replace non-alphanumeric with underscores
     * 4. Collapse multiple underscores
     * 5. Add 'tenant_' prefix if not present
     *
     * Examples (Enterprise):
     *   "My Cool App" → "tenant_a1b2c3d4e5f6789a"
     *   "测试应用" → "tenant_f9e8d7c6b5a49382"
     *   "🚀 Rocket" → "tenant_d4c9b8a7f6e51203"
     *
     * Examples (Personal):
     *   "monk-irc" → "tenant_monk_irc"
     *   "My Company" → "tenant_my_company"
     *   "test-db" → "tenant_test_db"
     *
     * @param tenantName - User-facing tenant name (any Unicode string)
     * @param mode - Naming mode (ENTERPRISE or PERSONAL)
     * @returns PostgreSQL database name with tenant_ prefix
     */
    static generateDatabaseName(
        tenantName: string,
        mode: TenantNamingMode = TenantNamingMode.ENTERPRISE,
    ): string {
        if (mode === TenantNamingMode.PERSONAL) {
            return this.generatePersonalModeName(tenantName);
        }

        // Enterprise mode: SHA256 hashing
        // Normalize Unicode for consistent hashing
        // NFC (Canonical Decomposition, followed by Canonical Composition)
        // ensures that "é" and "e + ´" produce the same hash
        const normalizedName = tenantName.trim().normalize('NFC');

        // Generate SHA256 hash and take first 16 characters (64 bits)
        // 16 hex chars = 64 bits = ~5 billion combinations before 50% collision
        const hash = createHash('sha256').update(normalizedName, 'utf8').digest('hex').substring(0, 16);

        // Add prefix to distinguish from test databases (which use test_*)
        return `tenant_${hash}`;
    }

    /**
     * Generate database name for personal mode
     *
     * Personal mode creates human-readable database names from tenant names.
     * This is useful for personal PaaS deployments where you want the database
     * name to match the tenant name (e.g., "monk-irc" → "tenant_monk_irc").
     *
     * Sanitization rules:
     * - Convert to lowercase
     * - Replace non-alphanumeric (except underscore) with underscore
     * - Collapse multiple underscores to single underscore
     * - Remove leading/trailing underscores
     * - Ensure tenant_ prefix
     *
     * @param tenantName - User-facing tenant name
     * @returns Sanitized database name with tenant_ prefix
     */
    private static generatePersonalModeName(tenantName: string): string {
        // Normalize and trim
        const normalized = tenantName.trim().normalize('NFC');

        // Convert to lowercase and replace non-alphanumeric with underscores
        // Allow letters, numbers, and underscores only
        const sanitized = normalized
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_') // Replace non-alphanumeric with underscore
            .replace(/_+/g, '_') // Collapse multiple underscores
            .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

        // Ensure tenant_ prefix
        if (sanitized.startsWith('tenant_')) {
            return sanitized;
        }

        return `tenant_${sanitized}`;
    }

    /**
     * Check if a database name follows tenant naming conventions
     *
     * Valid prefixes:
     * - tenant_ (production tenants)
     * - test_ (test databases)
     * - test_template_ (test templates)
     *
     * @param databaseName - Database name to check
     * @returns true if name follows conventions
     */
    static isTenantDatabase(databaseName: string): boolean {
        return (
            databaseName.startsWith('tenant_') ||
            databaseName.startsWith('test_') ||
            databaseName.startsWith('test_template_')
        );
    }

    /**
     * Extract hash from enterprise mode database name
     *
     * @param databaseName - Database name in format tenant_<hash>
     * @returns Hash portion, or null if not a valid tenant database
     */
    static extractHash(databaseName: string): string | null {
        if (!databaseName.startsWith('tenant_')) {
            return null;
        }

        const hash = databaseName.substring('tenant_'.length);
        return hash.length === 16 && /^[a-f0-9]+$/.test(hash) ? hash : null;
    }

    /**
     * Validate database name format
     *
     * Ensures database name:
     * - Is a non-empty string
     * - Contains only alphanumeric and underscore characters
     * - Follows PostgreSQL identifier rules
     *
     * @param databaseName - Database name to validate
     * @throws Error if validation fails
     */
    static validateDatabaseName(databaseName: string): void {
        if (typeof databaseName !== 'string') {
            throw new Error('Database name must be a string');
        }

        const trimmed = databaseName.trim();

        if (!trimmed) {
            throw new Error('Database name cannot be empty');
        }

        // PostgreSQL identifiers: alphanumeric + underscore only
        // This prevents SQL injection via database names
        if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
            throw new Error(`Database name "${databaseName}" contains invalid characters`);
        }

        // PostgreSQL max identifier length is 63 bytes
        if (trimmed.length > 63) {
            throw new Error(`Database name "${databaseName}" exceeds PostgreSQL limit (63 chars)`);
        }
    }
}
