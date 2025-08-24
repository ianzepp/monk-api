/**
 * Observer Loader
 * 
 * Handles file-based discovery, loading, and caching of observers.
 * Preloads all observers at server startup for optimal performance.
 */

import { glob } from '@lib/glob.local.js';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';

import type { Observer, ObserverConstructor } from './interfaces.js';
import type { 
    ObserverRing, 
    ObserverFilePattern,
    UniversalSchemaKeyword 
} from './types.js';
import { UNIVERSAL_SCHEMA_KEYWORD } from './types.js';

/**
 * Observer loader with file-based discovery and caching
 */
export class ObserverLoader {
    private static cache = new Map<string, Observer[]>();
    private static loaded = false;
    private static loadingPromise: Promise<void> | null = null;

    /**
     * Preload all observers at server startup
     * Safe to call multiple times - only loads once
     */
    static async preloadObservers(): Promise<void> {
        if (this.loaded) return;
        
        // Prevent concurrent loading attempts
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = this._doPreloadObservers();
        await this.loadingPromise;
        this.loadingPromise = null;
    }

    /**
     * Internal preloading implementation
     */
    private static async _doPreloadObservers(): Promise<void> {
        try {
            const observerFiles = await this._findObserverFiles();
            console.debug(`🔍 Found ${observerFiles.length} observer files to load`);

            for (const filePattern of observerFiles) {
                try {
                    await this._loadObserverFile(filePattern);
                } catch (error) {
                    console.warn(`⚠️  Failed to load observer: ${filePattern.filepath}`, error);
                    // Continue loading other observers - don't fail entire startup
                }
            }

            this.loaded = true;
            console.debug(`✅ Observer preloading complete: ${this.cache.size} cache entries`);
        } catch (error) {
            console.error('❌ Observer preloading failed:', error);
            throw new Error(`Observer preloading failed: ${error}`);
        }
    }

    /**
     * Find all observer files using glob pattern
     */
    private static async _findObserverFiles(): Promise<ObserverFilePattern[]> {
        // Get the project root directory
        const currentFileUrl = import.meta.url;
        const currentFilePath = fileURLToPath(currentFileUrl);
        const projectRoot = resolve(dirname(currentFilePath), '../../../');
        
        // Search for observer files: src/observers/**/*.ts
        const pattern = join(projectRoot, 'src/observers/**/*.ts');
        const files = await glob(pattern, { 
            ignore: ['**/*.test.ts', '**/*.spec.ts', '**/README.md']
        });

        const patterns: ObserverFilePattern[] = [];

        for (const file of files) {
            const parsedPattern = this._parseObserverFilePath(file, projectRoot);
            if (parsedPattern) {
                patterns.push(parsedPattern);
            }
        }

        return patterns;
    }

    /**
     * Parse observer file path into schema, ring, and filename components
     * Expected pattern: src/observers/:schema/:ring_number/file-name.ts
     */
    private static _parseObserverFilePath(
        filepath: string, 
        projectRoot: string
    ): ObserverFilePattern | null {
        const relativePath = filepath.replace(projectRoot + '/', '');
        const pathParts = relativePath.split('/');

        // Expected: ['src', 'observers', ':schema', ':ring_number', 'file-name.ts']
        if (pathParts.length < 5 || pathParts[0] !== 'src' || pathParts[1] !== 'observers') {
            console.warn(`⚠️  Invalid observer path pattern: ${relativePath}`);
            return null;
        }

        const schema = pathParts[2];
        const ringStr = pathParts[3];
        const filename = basename(pathParts[pathParts.length - 1], '.ts');

        // Validate ring number
        const ringNum = parseInt(ringStr, 10);
        if (isNaN(ringNum) || ringNum < 0 || ringNum > 9) {
            console.warn(`⚠️  Invalid ring number in observer path: ${relativePath} (ring: ${ringStr})`);
            return null;
        }

        return {
            schema,
            ring: ringNum as ObserverRing,
            filename,
            filepath: relativePath
        };
    }

    /**
     * Load and instantiate observer from file
     */
    private static async _loadObserverFile(filePattern: ObserverFilePattern): Promise<void> {
        try {
            // Dynamic import of the observer module using path mapping
            const importPath = filePattern.filepath.replace('src/', '@src/');
            const observerModule = await import(importPath);
            
            // Get the default export (should be observer class constructor)
            const ObserverClass = observerModule.default as ObserverConstructor;
            if (!ObserverClass || typeof ObserverClass !== 'function') {
                throw new Error(`Observer file must export a default class: ${filePattern.filepath}`);
            }

            // Instantiate the observer
            const observer = new ObserverClass();
            
            // Validate observer implementation
            this._validateObserver(observer, filePattern);

            // Add observer name for debugging if not provided
            if (!observer.name) {
                observer.name = `${filePattern.schema}:${filePattern.ring}:${filePattern.filename}`;
            }

            // Store in cache by schema:ring key
            const cacheKey = `${filePattern.schema}:${filePattern.ring}`;
            if (!this.cache.has(cacheKey)) {
                this.cache.set(cacheKey, []);
            }
            this.cache.get(cacheKey)!.push(observer);

            console.debug(`✅ Loaded observer: ${observer.name} (${cacheKey})`);
        } catch (error) {
            throw new Error(`Failed to load observer from ${filePattern.filepath}: ${error}`);
        }
    }

    /**
     * Validate that observer implements required interface
     */
    private static _validateObserver(observer: Observer, filePattern: ObserverFilePattern): void {
        if (typeof observer.execute !== 'function') {
            throw new Error(`Observer must implement execute() method: ${filePattern.filepath}`);
        }

        if (typeof observer.ring !== 'number' || observer.ring < 0 || observer.ring > 9) {
            throw new Error(`Observer must have valid ring (0-9): ${filePattern.filepath}`);
        }

        // Ring in file path should match ring in observer
        if (observer.ring !== filePattern.ring) {
            console.warn(`⚠️  Ring mismatch: file path suggests ring ${filePattern.ring}, observer declares ring ${observer.ring} (${filePattern.filepath})`);
        }
    }

    /**
     * Get cached observers for specific schema and ring
     * Returns both schema-specific and universal observers
     */
    static getObservers(schema: string, ring: ObserverRing): Observer[] {
        if (!this.loaded) {
            throw new Error('Observers not loaded - call preloadObservers() first');
        }

        const observers: Observer[] = [];

        // Get schema-specific observers
        const specificKey = `${schema}:${ring}`;
        const specific = this.cache.get(specificKey) || [];
        observers.push(...specific);

        // Get universal observers (all)
        const universalKey = `${UNIVERSAL_SCHEMA_KEYWORD}:${ring}`;
        const universal = this.cache.get(universalKey) || [];
        observers.push(...universal);

        return observers;
    }

    /**
     * Get all loaded observers for debugging/monitoring
     */
    static getAllObservers(): Map<string, Observer[]> {
        if (!this.loaded) {
            throw new Error('Observers not loaded - call preloadObservers() first');
        }
        return new Map(this.cache);
    }

    /**
     * Clear observer cache (useful for testing)
     */
    static clearCache(): void {
        this.cache.clear();
        this.loaded = false;
        this.loadingPromise = null;
    }

    /**
     * Check if observers are loaded
     */
    static isLoaded(): boolean {
        return this.loaded;
    }
}