import { describe, it, expect } from 'vitest';
import { AuthService, type JWTPayload } from './auth.js';

describe('AuthService', () => {
    describe('Domain-based Authentication', () => {
        it('should generate JWT token for valid domain', async () => {
            const domain = 'test_database_123';
            
            const result = await AuthService.login(domain);
            
            expect(result).toBeDefined();
            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('user');
            expect(result!.user.domain).toBe(domain);
            expect(result!.user.role).toBe('admin');
            expect(result!.user.username).toBe('test');
        });

        it('should reject login with no domain', async () => {
            const result = await AuthService.login('');
            
            expect(result).toBeNull();
        });

        it('should reject login with null domain', async () => {
            const result = await AuthService.login(null as any);
            
            expect(result).toBeNull();
        });

        it('should reject login with undefined domain', async () => {
            const result = await AuthService.login(undefined as any);
            
            expect(result).toBeNull();
        });
    });

    describe('JWT Token Generation and Verification', () => {
        it('should generate and verify JWT token with correct payload', async () => {
            const domain = 'test_db_456';
            
            // Generate token
            const loginResult = await AuthService.login(domain);
            expect(loginResult).toBeDefined();
            
            const token = loginResult!.token;
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            
            // Verify token
            const payload = await AuthService.verifyToken(token);
            
            expect(payload).toBeDefined();
            expect(payload.sub).toBe('test-user');
            expect(payload.email).toBe('test@test.com');
            expect(payload.username).toBe('test');
            expect(payload.domain).toBe(domain);
            expect(payload.role).toBe('admin');
            expect(payload.access_read).toEqual([]);
            expect(payload.access_edit).toEqual([]);
            expect(payload.access_full).toEqual([]);
            expect(payload.iat).toBeDefined();
            expect(payload.exp).toBeDefined();
        });

        it('should generate tokens with correct expiration', async () => {
            const domain = 'test_expiry';
            
            const loginResult = await AuthService.login(domain);
            const payload = await AuthService.verifyToken(loginResult!.token);
            
            const issuedAt = payload.iat;
            const expiresAt = payload.exp;
            const expectedExpiry = issuedAt + (24 * 60 * 60); // 24 hours
            
            expect(expiresAt).toBe(expectedExpiry);
            expect(expiresAt).toBeGreaterThan(issuedAt);
        });

        it('should preserve domain in JWT payload', async () => {
            const testDomains = [
                'test_db_1',
                'monk_api_test_2',
                'special-chars_db',
                'production_clone_123'
            ];
            
            for (const domain of testDomains) {
                const loginResult = await AuthService.login(domain);
                const payload = await AuthService.verifyToken(loginResult!.token);
                
                expect(payload.domain).toBe(domain);
            }
        });

        it('should reject invalid JWT tokens', async () => {
            const invalidTokens = [
                'invalid.token.here',
                'not-a-jwt',
                '',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature'
            ];
            
            for (const invalidToken of invalidTokens) {
                await expect(AuthService.verifyToken(invalidToken)).rejects.toThrow();
            }
        });
    });

    describe('Token Refresh', () => {
        it('should refresh valid token with same domain', async () => {
            const domain = 'refresh_test_db';
            
            // Generate initial token
            const loginResult = await AuthService.login(domain);
            const originalToken = loginResult!.token;
            
            // Wait a moment to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Refresh token
            const refreshedToken = await AuthService.refreshToken(originalToken);
            
            expect(refreshedToken).toBeDefined();
            expect(refreshedToken).not.toBe(originalToken);
            
            // Verify refreshed token has same domain
            const refreshedPayload = await AuthService.verifyToken(refreshedToken!);
            expect(refreshedPayload.domain).toBe(domain);
        });

        it('should reject refresh with invalid token', async () => {
            const invalidToken = 'invalid.token.here';
            
            const result = await AuthService.refreshToken(invalidToken);
            
            expect(result).toBeNull();
        });

        it('should generate new expiration time on refresh', async () => {
            const domain = 'refresh_expiry_test';
            
            const loginResult = await AuthService.login(domain);
            const originalToken = loginResult!.token;
            const originalPayload = await AuthService.verifyToken(originalToken);
            
            // Wait a moment to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const refreshedToken = await AuthService.refreshToken(originalToken);
            const refreshedPayload = await AuthService.verifyToken(refreshedToken!);
            
            expect(refreshedPayload.iat).toBeGreaterThan(originalPayload.iat);
            expect(refreshedPayload.exp).toBeGreaterThan(originalPayload.exp);
        });
    });

    describe('JWT Payload Structure', () => {
        it('should include all required JWT payload fields', async () => {
            const domain = 'payload_test_db';
            
            const loginResult = await AuthService.login(domain);
            const payload = await AuthService.verifyToken(loginResult!.token);
            
            // Check all required fields exist
            expect(payload).toHaveProperty('sub');
            expect(payload).toHaveProperty('email');
            expect(payload).toHaveProperty('username');
            expect(payload).toHaveProperty('domain');
            expect(payload).toHaveProperty('role');
            expect(payload).toHaveProperty('access_read');
            expect(payload).toHaveProperty('access_edit');
            expect(payload).toHaveProperty('access_full');
            expect(payload).toHaveProperty('iat');
            expect(payload).toHaveProperty('exp');
            
            // Check field types
            expect(typeof payload.sub).toBe('string');
            expect(typeof payload.email).toBe('string');
            expect(typeof payload.username).toBe('string');
            expect(typeof payload.domain).toBe('string');
            expect(typeof payload.role).toBe('string');
            expect(Array.isArray(payload.access_read)).toBe(true);
            expect(Array.isArray(payload.access_edit)).toBe(true);
            expect(Array.isArray(payload.access_full)).toBe(true);
            expect(typeof payload.iat).toBe('number');
            expect(typeof payload.exp).toBe('number');
        });

        it('should have admin role for test tokens', async () => {
            const domain = 'admin_role_test';
            
            const loginResult = await AuthService.login(domain);
            const payload = await AuthService.verifyToken(loginResult!.token);
            
            expect(payload.role).toBe('admin');
        });

        it('should have empty ACL arrays for test tokens', async () => {
            const domain = 'acl_test_db';
            
            const loginResult = await AuthService.login(domain);
            const payload = await AuthService.verifyToken(loginResult!.token);
            
            expect(payload.access_read).toEqual([]);
            expect(payload.access_edit).toEqual([]);
            expect(payload.access_full).toEqual([]);
        });
    });

    describe('Multiple Domain Support', () => {
        it('should handle multiple domains simultaneously', async () => {
            const domains = ['db1', 'db2', 'db3'];
            const tokens: string[] = [];
            
            // Generate tokens for multiple domains
            for (const domain of domains) {
                const loginResult = await AuthService.login(domain);
                tokens.push(loginResult!.token);
            }
            
            // Verify each token contains correct domain
            for (let i = 0; i < domains.length; i++) {
                const payload = await AuthService.verifyToken(tokens[i]);
                expect(payload.domain).toBe(domains[i]);
            }
        });

        it('should generate unique tokens for different domains', async () => {
            const domain1 = 'unique_test_1';
            const domain2 = 'unique_test_2';
            
            const result1 = await AuthService.login(domain1);
            const result2 = await AuthService.login(domain2);
            
            expect(result1!.token).not.toBe(result2!.token);
            
            const payload1 = await AuthService.verifyToken(result1!.token);
            const payload2 = await AuthService.verifyToken(result2!.token);
            
            expect(payload1.domain).toBe(domain1);
            expect(payload2.domain).toBe(domain2);
        });
    });
});