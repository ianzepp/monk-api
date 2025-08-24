import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

export interface GlobOptions {
    ignore?: string[];
}

/**
 * Local glob implementation for simple file pattern matching
 * 
 * Replaces the external glob package for basic recursive file discovery.
 * Supports simple recursive directory patterns with ignore filters.
 */
export async function glob(pattern: string, options: GlobOptions = {}): Promise<string[]> {
    const ignore = options.ignore || [];
    
    // Parse pattern - for now, support simple "dir/**/*.ext" patterns
    const parts = pattern.split('/**/');
    if (parts.length !== 2) {
        throw new Error(`Unsupported glob pattern: ${pattern}. Only dir/**/*.ext patterns supported.`);
    }
    
    const baseDir = resolve(parts[0]);
    const filePattern = parts[1]; // e.g., "*.ts"
    
    return findFiles(baseDir, filePattern, ignore);
}

/**
 * Recursively find files matching pattern with ignore filters
 */
function findFiles(dir: string, filePattern: string, ignore: string[]): string[] {
    const files: string[] = [];
    
    function traverse(currentDir: string) {
        try {
            const entries = readdirSync(currentDir);
            
            for (const entry of entries) {
                const fullPath = join(currentDir, entry);
                
                // Check ignore patterns
                if (shouldIgnore(fullPath, ignore)) {
                    continue;
                }
                
                const stat = statSync(fullPath);
                
                if (stat.isDirectory()) {
                    traverse(fullPath); // Recurse into subdirectories
                } else if (matchesPattern(entry, filePattern)) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Skip directories that can't be read
            console.warn(`Warning: Cannot read directory ${currentDir}:`, error);
        }
    }
    
    traverse(dir);
    return files;
}

/**
 * Check if file should be ignored based on ignore patterns
 */
function shouldIgnore(filePath: string, ignore: string[]): boolean {
    for (const pattern of ignore) {
        if (pattern.startsWith('**/')) {
            // Pattern like "**/*.test.ts" - check if file path contains the suffix
            const suffix = pattern.substring(3);
            if (filePath.includes(suffix)) {
                return true;
            }
        } else if (filePath.includes(pattern)) {
            // Simple substring match
            return true;
        }
    }
    return false;
}

/**
 * Check if filename matches pattern (simple patterns only)
 */
function matchesPattern(filename: string, pattern: string): boolean {
    if (pattern === '*') {
        return true;
    }
    if (pattern.startsWith('*.')) {
        const extension = pattern.substring(1);
        return filename.endsWith(extension);
    }
    return filename === pattern;
}