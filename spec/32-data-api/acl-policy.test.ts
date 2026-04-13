import { describe, expect, it } from 'bun:test';
import { canDeleteRecord, canReadRecord, canUpdateRecord } from '@src/lib/acl-policy.js';

const userId = 'user-123';

describe('ACL policy role fallback', () => {
    it('allows empty ACL reads based on role', () => {
        const acl = {
            access_read: [],
            access_edit: [],
            access_full: [],
            access_deny: []
        };

        expect(canReadRecord(acl, userId, 'read')).toBe(true);
        expect(canReadRecord(acl, userId, 'edit')).toBe(true);
        expect(canReadRecord(acl, userId, 'full')).toBe(true);
        expect(canReadRecord(acl, userId, 'deny')).toBe(false);
    });

    it('allows empty ACL updates and deletes only at the documented role thresholds', () => {
        const acl = {
            access_read: [],
            access_edit: [],
            access_full: [],
            access_deny: []
        };

        expect(canUpdateRecord(acl, userId, 'read')).toBe(false);
        expect(canUpdateRecord(acl, userId, 'edit')).toBe(true);
        expect(canDeleteRecord(acl, userId, 'edit')).toBe(false);
        expect(canDeleteRecord(acl, userId, 'full')).toBe(true);
    });

    it('does not use role fallback once explicit ACLs exist', () => {
        const acl = {
            access_read: ['someone-else'],
            access_edit: [],
            access_full: [],
            access_deny: []
        };

        expect(canReadRecord(acl, userId, 'full')).toBe(false);
        expect(canUpdateRecord(acl, userId, 'full')).toBe(false);
    });

    it('keeps deny precedence over both explicit grants and role fallback', () => {
        const explicitAcl = {
            access_read: [userId],
            access_edit: [userId],
            access_full: [userId],
            access_deny: [userId]
        };

        const emptyAcl = {
            access_read: [],
            access_edit: [],
            access_full: [],
            access_deny: [userId]
        };

        expect(canReadRecord(explicitAcl, userId, 'full')).toBe(false);
        expect(canUpdateRecord(explicitAcl, userId, 'full')).toBe(false);
        expect(canDeleteRecord(explicitAcl, userId, 'full')).toBe(false);

        expect(canReadRecord(emptyAcl, userId, 'full')).toBe(false);
        expect(canUpdateRecord(emptyAcl, userId, 'full')).toBe(false);
        expect(canDeleteRecord(emptyAcl, userId, 'full')).toBe(false);
    });
});
