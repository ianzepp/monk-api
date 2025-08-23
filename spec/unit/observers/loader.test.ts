/**
 * ObserverLoader Tests
 */

import { describe, test, beforeEach, afterEach, expect } from 'vitest';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { ObserverRing } from '@src/lib/observers/types.js';

describe('ObserverLoader', () => {
    beforeEach(() => {
        // Clear cache before each test
        ObserverLoader.clearCache();
    });

    afterEach(() => {
        // Clear cache after each test
        ObserverLoader.clearCache();
    });

    describe('cache management', () => {
        test('should start with empty cache', () => {
            expect(ObserverLoader.isLoaded()).toBe(false);
            // Should throw error when trying to access cache before loading
            expect(() => ObserverLoader.getAllObservers()).toThrow('Observers not loaded');
        });

        test('should clear cache properly', () => {
            ObserverLoader.clearCache();
            expect(ObserverLoader.isLoaded()).toBe(false);
            // Should throw error when trying to access cache after clearing
            expect(() => ObserverLoader.getAllObservers()).toThrow('Observers not loaded');
        });
    });

    describe('getObservers', () => {
        test('should throw error if observers not loaded', () => {
            expect(() => {
                ObserverLoader.getObservers('users', ObserverRing.Validation);
            }).toThrow('Observers not loaded - call preloadObservers() first');
        });
    });

    describe('preloadObservers', () => {
        test('should handle empty observer directory gracefully', async () => {
            // This will attempt to preload from actual filesystem
            // In a real project, we'd mock the filesystem
            await expect(ObserverLoader.preloadObservers()).resolves.not.toThrow();
            expect(ObserverLoader.isLoaded()).toBe(true);
        });

        test('should be safe to call multiple times', async () => {
            await ObserverLoader.preloadObservers();
            expect(ObserverLoader.isLoaded()).toBe(true);

            // Calling again should not cause issues
            await ObserverLoader.preloadObservers();
            expect(ObserverLoader.isLoaded()).toBe(true);
        });
    });

    describe('file path parsing', () => {
        test('should handle universal schema keywords', async () => {
            await ObserverLoader.preloadObservers();
            
            // Test that universal observers would be returned for any schema
            const observers1 = ObserverLoader.getObservers('users', ObserverRing.Validation);
            const observers2 = ObserverLoader.getObservers('accounts', ObserverRing.Validation);
            
            // Both should return the same universal observers (if any exist)
            expect(observers1).toEqual(observers2);
        });
    });

    describe('getAllObservers', () => {
        test('should throw error if observers not loaded', () => {
            expect(() => {
                ObserverLoader.getAllObservers();
            }).toThrow('Observers not loaded - call preloadObservers() first');
        });

        test('should return map after loading', async () => {
            await ObserverLoader.preloadObservers();
            const allObservers = ObserverLoader.getAllObservers();
            expect(allObservers).toBeInstanceOf(Map);
        });
    });
});