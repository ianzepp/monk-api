// /**
//  * Pipeline Loader
//  *
//  * Handles file-based discovery, loading, and caching of observers.
//  * Preloads all observers at server startup for optimal performance.
//  */

// import { glob } from '@src/lib/glob.local.js';
// import { logger } from '@src/lib/logger.js';
// import { join, dirname, basename, resolve } from 'path';
// import { fileURLToPath } from 'url';

// import type { Pipeline, PipelineConstructor } from '@src/lib/pipeline/interfaces.js';
// import type {
//     PipelineRing,
//     PipelineFilePattern,
//     UniversalSchemaKeyword
// } from '@src/lib/pipeline/types.js';
// import { UNIVERSAL_SCHEMA_KEYWORD } from '@src/lib/pipeline/types.js';

/**
 * Pipeline loader with file-based discovery and caching
 */
export class PipelineLoader {
//     private static cache = new Map<string, Pipeline[]>();
//     private static loaded = false;
//     private static loadingPromise: Promise<void> | null = null;

//     /**
//      * Preload all observers at server startup
//      * Safe to call multiple times - only loads once
//      */
//     static async preloadPipelines(): Promise<void> {
//         if (this.loaded) return;

//         // Prevent concurrent loading attempts
//         if (this.loadingPromise) {
//             return this.loadingPromise;
//         }

//         this.loadingPromise = this._doPreloadPipelines();
//         await this.loadingPromise;
//         this.loadingPromise = null;
//     }

//     /**
//      * Internal preloading implementation
//      */
//     private static async _doPreloadPipelines(): Promise<void> {
//         try {
//             const observerFiles = await this._findPipelineFiles();
//             logger.info('Pipeline files discovered', { fileCount: observerFiles.length });

//             for (const filePattern of observerFiles) {
//                 try {
//                     await this._loadPipelineFile(filePattern);
//                 } catch (error) {
//                     logger.warn('Failed to load observer', {
//                         file: filePattern.filepath,
//                         error: error instanceof Error ? error.message : String(error)
//                     });
//                     // Continue loading other observers - don't fail entire startup
//                 }
//             }

//             this.loaded = true;
//             logger.info('Pipeline preloading complete', { cacheEntries: this.cache.size });
//         } catch (error) {
//             logger.warn('Pipeline preloading failed', {
//                 error: error instanceof Error ? error.message : String(error)
//             });
//             throw new Error(`Pipeline preloading failed: ${error}`);
//         }
//     }

//     /**
//      * Find all observer files using glob pattern
//      */
//     private static async _findPipelineFiles(): Promise<PipelineFilePattern[]> {
//         // Get the project root directory
//         const currentFileUrl = import.meta.url;
//         const currentFilePath = fileURLToPath(currentFileUrl);
//         const projectRoot = resolve(dirname(currentFilePath), '../../../');

//         // Search for observer files: src/pipeline/**/*.ts
//         const pattern = join(projectRoot, 'src/pipeline/**/*.ts');
//         const files = await glob(pattern, {
//             ignore: ['**/*.test.ts', '**/*.spec.ts', '**/README.md']
//         });

//         const patterns: PipelineFilePattern[] = [];

//         for (const file of files) {
//             const parsedPattern = this._parsePipelineFilePath(file, projectRoot);
//             if (parsedPattern) {
//                 patterns.push(parsedPattern);
//             }
//         }

//         return patterns;
//     }

//     /**
//      * Parse observer file path into schema, ring, and filename components
//      * Expected pattern: src/pipeline/:schema/:ring_number/file-name.ts
//      */
//     private static _parsePipelineFilePath(
//         filepath: string,
//         projectRoot: string
//     ): PipelineFilePattern | null {
//         const relativePath = filepath.replace(projectRoot + '/', '');
//         const pathParts = relativePath.split('/');

//         // Expected: ['src', 'observers', ':schema', ':ring_number', 'file-name.ts']
//         if (pathParts.length < 5 || pathParts[0] !== 'src' || pathParts[1] !== 'observers') {
//             logger.warn('Invalid observer path pattern', { path: relativePath });
//             return null;
//         }

//         const schema = pathParts[2];
//         const ringStr = pathParts[3];
//         const filename = basename(pathParts[pathParts.length - 1], '.ts');

//         // Validate ring number
//         const ringNum = parseInt(ringStr, 10);
//         if (isNaN(ringNum) || ringNum < 0 || ringNum > 9) {
//             logger.warn('Invalid ring number in observer path', { path: relativePath, ring: ringStr });
//             return null;
//         }

//         return {
//             schema,
//             ring: ringNum as PipelineRing,
//             filename,
//             filepath: relativePath
//         };
//     }

//     /**
//      * Load and instantiate observer from file
//      */
//     private static async _loadPipelineFile(filePattern: PipelineFilePattern): Promise<void> {
//         try {
//             // Dynamic import of the observer module from compiled dist directory
//             // Convert relative path from TypeScript source to compiled JavaScript
//             const currentFileUrl = import.meta.url;
//             const currentFilePath = fileURLToPath(currentFileUrl);
//             const projectRoot = resolve(dirname(currentFilePath), '../../../');
//             const distPath = filePattern.filepath.replace('src/', 'dist/').replace('.ts', '.js');
//             const importPath = resolve(projectRoot, distPath);

//             const observerModule = await import(importPath);

//             // Get the default export (should be observer class constructor)
//             const PipelineClass = observerModule.default as PipelineConstructor;
//             if (!PipelineClass || typeof PipelineClass !== 'function') {
//                 throw new Error(`Observer file must export a default class: ${filePattern.filepath}`);
//             }

//             // Instantiate the observer
//             const observer = new PipelineClass();

//             // Validate observer implementation
//             this._validatePipeline(observer, filePattern);

//             // Add observer name for debugging if not provided
//             if (!observer.name) {
//                 observer.name = `${filePattern.schema}:${filePattern.ring}:${filePattern.filename}`;
//             }

//             // Store in cache by schema:ring key
//             const cacheKey = `${filePattern.schema}:${filePattern.ring}`;
//             if (!this.cache.has(cacheKey)) {
//                 this.cache.set(cacheKey, []);
//             }
//             this.cache.get(cacheKey)!.push(observer);

//             logger.info('Observer loaded', { name: observer.name, cacheKey });
//         } catch (error) {
//             throw new Error(`Failed to load observer from ${filePattern.filepath}: ${error}`);
//         }
//     }

//     /**
//      * Validate that observer implements required interface
//      */
//     private static _validatePipeline(pipeline: Pipeline, filePattern: PipelineFilePattern): void {
//         if (typeof pipeline.execute !== 'function') {
//             throw new Error(`Pipeline must implement execute() method: ${filePattern.filepath}`);
//         }

//         if (typeof pipeline.ring !== 'number' || pipeline.ring < 0 || pipeline.ring > 9) {
//             throw new Error(`Pipeline must have valid ring (0-9): ${filePattern.filepath}`);
//         }

//         // Ring in file path should match ring in observer
//         if (pipeline.ring !== filePattern.ring) {
//             logger.warn('Ring mismatch between file path and observer declaration', {
//                 file: filePattern.filepath,
//                 pathRing: filePattern.ring,
//                 observerRing: pipeline.ring
//             });
//         }
//     }

//     /**
//      * Get cached observers for specific schema and ring
//      * Returns both schema-specific and universal observers
//      */
//     static getPipelines(schema: string, ring: PipelineRing): Observer[] {
//         if (!this.loaded) {
//             throw new Error('Pipelines not loaded - call preloadPipelines() first');
//         }

//         const observers: Observer[] = [];

//         // Get schema-specific observers
//         const specificKey = `${schema}:${ring}`;
//         const specific = this.cache.get(specificKey) || [];
//         observers.push(...specific);

//         // Get universal observers (all)
//         const universalKey = `${UNIVERSAL_SCHEMA_KEYWORD}:${ring}`;
//         const universal = this.cache.get(universalKey) || [];
//         observers.push(...universal);

//         return observers;
//     }

//     /**
//      * Get all loaded observers for debugging/monitoring
//      */
//     static getAllPipelines(): Map<string, Pipeline[]> {
//         if (!this.loaded) {
//             throw new Error('Pipelines not loaded - call preloadPipelines() first');
//         }
//         return new Map(this.cache);
//     }

//     /**
//      * Clear observer cache (useful for testing)
//      */
//     static clearCache(): void {
//         this.cache.clear();
//         this.loaded = false;
//         this.loadingPromise = null;
//     }

//     /**
//      * Check if observers are loaded
//      */
//     static isLoaded(): boolean {
//         return this.loaded;
//     }
}
