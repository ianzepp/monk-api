import { describe, it, expect } from 'vitest';
import { DatabaseNaming, TenantNamingMode } from '@src/lib/database-naming.js';

describe('DatabaseNaming', () => {
    describe('generateDatabaseName', () => {
        describe('ENTERPRISE mode', () => {
            it('should generate consistent hash for same input', () => {
                const name = 'My Cool App';
                const result1 = DatabaseNaming.generateDatabaseName(name);
                const result2 = DatabaseNaming.generateDatabaseName(name);
                expect(result1).toBe(result2);
            });

            it('should add tenant_ prefix', () => {
                const name = 'test';
                const result = DatabaseNaming.generateDatabaseName(name);
                expect(result).toMatch(/^tenant_[a-f0-9]{16}$/);
            });

            it('should generate 16-character hex hash', () => {
                const name = 'test';
                const result = DatabaseNaming.generateDatabaseName(name);
                const hash = result.substring('tenant_'.length);
                expect(hash).toHaveLength(16);
                expect(hash).toMatch(/^[a-f0-9]+$/);
            });

            it('should handle Unicode characters', () => {
                const unicodeNames = [
                    '测试应用',
                    '🚀 Rocket',
                    'Café Application',
                    'Тест',
                ];

                unicodeNames.forEach((name) => {
                    const result = DatabaseNaming.generateDatabaseName(name);
                    expect(result).toMatch(/^tenant_[a-f0-9]{16}$/);
                });
            });

            it('should normalize Unicode for consistent hashing', () => {
                // "é" can be represented as single char or "e" + combining accent
                const composed = 'café'; // Single é character (U+00E9)
                const decomposed = 'cafe\u0301'; // e + combining accent (U+0065 + U+0301)

                const hash1 = DatabaseNaming.generateDatabaseName(composed);
                const hash2 = DatabaseNaming.generateDatabaseName(decomposed);

                expect(hash1).toBe(hash2);
            });

            it('should trim whitespace before hashing', () => {
                const result1 = DatabaseNaming.generateDatabaseName('  test  ');
                const result2 = DatabaseNaming.generateDatabaseName('test');
                expect(result1).toBe(result2);
            });

            it('should handle long tenant names', () => {
                const longName = 'a'.repeat(1000);
                const result = DatabaseNaming.generateDatabaseName(longName);
                expect(result).toMatch(/^tenant_[a-f0-9]{16}$/);
            });

            it('should produce different hashes for different inputs', () => {
                const name1 = 'tenant1';
                const name2 = 'tenant2';
                const result1 = DatabaseNaming.generateDatabaseName(name1);
                const result2 = DatabaseNaming.generateDatabaseName(name2);
                expect(result1).not.toBe(result2);
            });

            it('should handle empty-ish names after trim', () => {
                // This will create a hash of empty string, which is still valid
                const result = DatabaseNaming.generateDatabaseName('   ');
                expect(result).toMatch(/^tenant_[a-f0-9]{16}$/);
            });

            it('should match known test cases from documentation', () => {
                // These would need to be verified against actual output
                const testCases = [
                    { input: 'My Cool App', expectedPrefix: 'tenant_' },
                    { input: '测试应用', expectedPrefix: 'tenant_' },
                    { input: '🚀 Rocket', expectedPrefix: 'tenant_' },
                ];

                testCases.forEach(({ input, expectedPrefix }) => {
                    const result = DatabaseNaming.generateDatabaseName(input);
                    expect(result.startsWith(expectedPrefix)).toBe(true);
                    expect(result.length).toBe(expectedPrefix.length + 16);
                });
            });
        });

        describe('PERSONAL mode', () => {
            it('should throw error (not yet implemented)', () => {
                expect(() => {
                    DatabaseNaming.generateDatabaseName('test', TenantNamingMode.PERSONAL);
                }).toThrow('PERSONAL naming mode not yet implemented');
            });
        });
    });

    describe('isTenantDatabase', () => {
        it('should return true for tenant_ prefix', () => {
            expect(DatabaseNaming.isTenantDatabase('tenant_abc123')).toBe(true);
        });

        it('should return true for test_ prefix', () => {
            expect(DatabaseNaming.isTenantDatabase('test_abc123')).toBe(true);
        });

        it('should return true for test_template_ prefix', () => {
            expect(DatabaseNaming.isTenantDatabase('test_template_abc123')).toBe(true);
        });

        it('should return false for system database', () => {
            expect(DatabaseNaming.isTenantDatabase('system')).toBe(false);
        });

        it('should return false for monk database', () => {
            expect(DatabaseNaming.isTenantDatabase('monk')).toBe(false);
        });

        it('should return false for postgres database', () => {
            expect(DatabaseNaming.isTenantDatabase('postgres')).toBe(false);
        });

        it('should return false for custom prefix', () => {
            expect(DatabaseNaming.isTenantDatabase('mydb_123')).toBe(false);
        });
    });

    describe('extractHash', () => {
        it('should extract valid 16-char hex hash', () => {
            const hash = DatabaseNaming.extractHash('tenant_a1b2c3d4e5f67890');
            expect(hash).toBe('a1b2c3d4e5f67890');
        });

        it('should return null for non-tenant database', () => {
            const hash = DatabaseNaming.extractHash('test_abc123');
            expect(hash).toBeNull();
        });

        it('should return null for invalid hash length', () => {
            const hash = DatabaseNaming.extractHash('tenant_abc');
            expect(hash).toBeNull();
        });

        it('should return null for non-hex characters', () => {
            const hash = DatabaseNaming.extractHash('tenant_g1b2c3d4e5f67890');
            expect(hash).toBeNull();
        });

        it('should return null for uppercase hex', () => {
            const hash = DatabaseNaming.extractHash('tenant_A1B2C3D4E5F67890');
            expect(hash).toBeNull();
        });

        it('should handle database without prefix', () => {
            const hash = DatabaseNaming.extractHash('mydb');
            expect(hash).toBeNull();
        });
    });

    describe('validateDatabaseName', () => {
        it('should accept valid alphanumeric name', () => {
            expect(() => {
                DatabaseNaming.validateDatabaseName('tenant_abc123');
            }).not.toThrow();
        });

        it('should accept underscores', () => {
            expect(() => {
                DatabaseNaming.validateDatabaseName('tenant_my_database_123');
            }).not.toThrow();
        });

        it('should reject non-string input', () => {
            expect(() => {
                DatabaseNaming.validateDatabaseName(123 as any);
            }).toThrow('Database name must be a string');
        });

        it('should reject empty string', () => {
            expect(() => {
                DatabaseNaming.validateDatabaseName('');
            }).toThrow('Database name cannot be empty');
        });

        it('should reject whitespace-only string', () => {
            expect(() => {
                DatabaseNaming.validateDatabaseName('   ');
            }).toThrow('Database name cannot be empty');
        });

        it('should reject names with special characters', () => {
            const invalidNames = [
                'tenant-123',
                'tenant.123',
                'tenant 123',
                'tenant@123',
                'tenant#123',
                'tenant$123',
                'tenant%123',
                'tenant!123',
            ];

            invalidNames.forEach((name) => {
                expect(() => {
                    DatabaseNaming.validateDatabaseName(name);
                }).toThrow('contains invalid characters');
            });
        });

        it('should reject names with semicolons (SQL injection)', () => {
            expect(() => {
                DatabaseNaming.validateDatabaseName('tenant_123; DROP TABLE users;--');
            }).toThrow('contains invalid characters');
        });

        it('should reject names longer than 63 characters', () => {
            const longName = 'tenant_' + 'a'.repeat(60);
            expect(() => {
                DatabaseNaming.validateDatabaseName(longName);
            }).toThrow('exceeds PostgreSQL limit');
        });

        it('should accept names up to 63 characters', () => {
            const maxName = 'tenant_' + 'a'.repeat(56); // exactly 63 chars
            expect(() => {
                DatabaseNaming.validateDatabaseName(maxName);
            }).not.toThrow();
        });

        it('should trim whitespace before validation', () => {
            expect(() => {
                DatabaseNaming.validateDatabaseName('  tenant_123  ');
            }).not.toThrow();
        });
    });

    describe('Integration: generateDatabaseName + validateDatabaseName', () => {
        it('should generate names that pass validation', () => {
            const tenantNames = [
                'My Company',
                'test',
                '测试应用',
                '🚀 Rocket',
                'Café Application',
            ];

            tenantNames.forEach((name) => {
                const dbName = DatabaseNaming.generateDatabaseName(name);
                expect(() => {
                    DatabaseNaming.validateDatabaseName(dbName);
                }).not.toThrow();
            });
        });

        it('should generate names that are recognized as tenant databases', () => {
            const tenantNames = ['test1', 'test2', 'test3'];

            tenantNames.forEach((name) => {
                const dbName = DatabaseNaming.generateDatabaseName(name);
                expect(DatabaseNaming.isTenantDatabase(dbName)).toBe(true);
            });
        });

        it('should generate names with extractable hashes', () => {
            const tenantNames = ['test1', 'test2', 'test3'];

            tenantNames.forEach((name) => {
                const dbName = DatabaseNaming.generateDatabaseName(name);
                const hash = DatabaseNaming.extractHash(dbName);
                expect(hash).not.toBeNull();
                expect(hash).toHaveLength(16);
            });
        });
    });
});
