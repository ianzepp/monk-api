/**
 * Comprehensive SQL Injection Attack Vector Library
 *
 * Collection of known SQL injection patterns organized by attack type.
 * Used for systematic security testing across all API endpoints.
 */
export interface InjectionVector {
    name: string;
    payload: string;
    category: string;
    description: string;
    expectedBehavior: 'safe_storage' | 'validation_error' | 'no_response_change';
}
/**
 * Classic SQL injection attack patterns
 */
export declare const CLASSIC_INJECTION_VECTORS: InjectionVector[];
/**
 * PostgreSQL-specific injection vectors
 */
export declare const POSTGRESQL_INJECTION_VECTORS: InjectionVector[];
/**
 * Advanced injection techniques
 */
export declare const ADVANCED_INJECTION_VECTORS: InjectionVector[];
/**
 * Encoding bypass attempts
 */
export declare const ENCODING_INJECTION_VECTORS: InjectionVector[];
/**
 * Case sensitivity and whitespace evasion
 */
export declare const EVASION_INJECTION_VECTORS: InjectionVector[];
/**
 * Get all injection vectors combined
 */
export declare function getAllInjectionVectors(): InjectionVector[];
/**
 * Get injection vectors by category
 */
export declare function getInjectionVectorsByCategory(category: string): InjectionVector[];
/**
 * Get injection vector categories
 */
export declare function getInjectionCategories(): string[];
/**
 * Common malicious payloads for field testing
 */
export declare const MALICIOUS_FIELD_PAYLOADS: string[];
/**
 * Edge case injection patterns
 */
export declare const EDGE_CASE_PAYLOADS: (string | null | undefined)[];
//# sourceMappingURL=injection-vectors.d.ts.map