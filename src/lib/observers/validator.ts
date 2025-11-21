/**
 * Observer File Validation
 *
 * Validates that observer files follow naming conventions and that filename
 * metadata (ring, priority) matches the properties defined in the observer class.
 *
 * Format: observers/{schema}/{ring}/{priority}-{name}.ts
 *
 * Checks:
 * - Filename has correct format: {priority}-{name}.ts
 * - Priority in filename matches readonly priority property in class
 * - Ring in directory path matches readonly ring property in class
 *
 * This runs at startup to catch configuration drift early.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ObserverRing } from '@src/lib/observers/types.js';

interface ValidationError {
    file: string;
    error: string;
    expected?: any;
    actual?: any;
}

interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: string[];
    filesChecked: number;
}

export class ObserverValidator {
    private static readonly OBSERVER_BASE_PATH = path.join(process.cwd(), 'src/observers');
    private static readonly FILE_PATTERN = /^(\d{2})-(.+)\.ts$/;

    /**
     * Validate all observer files
     */
    static async validateAll(): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: string[] = [];
        let filesChecked = 0;

        try {
            await this.validateDirectory(this.OBSERVER_BASE_PATH, errors, warnings, filesChecked);
        } catch (error) {
            errors.push({
                file: 'global',
                error: `Failed to validate observers: ${error instanceof Error ? error.message : String(error)}`
            });
        }

        const valid = errors.length === 0;

        if (!valid) {
            console.error('Observer validation failed', {
                errorCount: errors.length,
                warningCount: warnings.length,
                filesChecked
            });
        } else {
            console.info('Observer validation passed', {
                filesChecked,
                warningCount: warnings.length
            });
        }

        return { valid, errors, warnings, filesChecked };
    }

    /**
     * Recursively validate observer directory
     */
    private static async validateDirectory(
        dir: string,
        errors: ValidationError[],
        warnings: string[],
        filesChecked: number
    ): Promise<void> {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // Recurse into subdirectories
                await this.validateDirectory(fullPath, errors, warnings, filesChecked);
            } else if (entry.isFile() && entry.name.endsWith('.ts')) {
                // Validate observer file
                this.validateObserverFile(fullPath, errors, warnings);
                filesChecked++;
            }
        }
    }

    /**
     * Validate a single observer file
     */
    private static validateObserverFile(
        filePath: string,
        errors: ValidationError[],
        warnings: string[]
    ): void {
        const relativePath = path.relative(this.OBSERVER_BASE_PATH, filePath);
        const fileName = path.basename(filePath);
        const dirName = path.basename(path.dirname(filePath));

        // Check filename format
        const match = fileName.match(this.FILE_PATTERN);
        if (!match) {
            errors.push({
                file: relativePath,
                error: 'Filename does not match pattern {priority}-{name}.ts',
                expected: 'XX-name.ts (where XX is 00-99)',
                actual: fileName
            });
            return;
        }

        const filenamePriority = parseInt(match[1], 10);

        // Extract schema and ring from directory path
        // Expected: observers/{schema}/{ring}/{priority}-{name}.ts
        const pathParts = relativePath.split(path.sep);
        if (pathParts.length < 3) {
            warnings.push(`File ${relativePath} has unexpected path structure (expected: {schema}/{ring}/{priority}-{name}.ts)`);
            return;
        }

        const schemaDir = pathParts[pathParts.length - 3];
        const ringDir = pathParts[pathParts.length - 2];
        const ringNumber = parseInt(ringDir, 10);

        // Validate ring directory
        if (isNaN(ringNumber) || ringNumber < 0 || ringNumber > 9) {
            errors.push({
                file: relativePath,
                error: 'Ring directory must be 0-9',
                actual: ringDir
            });
            return;
        }

        // Validate schema directory (basic check - must be valid identifier or "all")
        if (!schemaDir || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaDir)) {
            errors.push({
                file: relativePath,
                error: 'Schema directory must be a valid identifier (letters, digits, underscores) or "all"',
                actual: schemaDir
            });
            return;
        }

        // Read file contents
        const fileContents = fs.readFileSync(filePath, 'utf-8');

        // Extract priority from file
        const priorityMatch = fileContents.match(/readonly\s+priority\s*[:=]\s*(\d+)/);
        const codePriority = priorityMatch ? parseInt(priorityMatch[1], 10) : 50; // Default is 50

        // Extract ring from file
        const ringMatch = fileContents.match(/readonly\s+ring\s*[:=]\s*ObserverRing\.(\w+)/);

        if (ringMatch) {
            const ringName = ringMatch[1];
            const expectedRing = ObserverRing[ringName as keyof typeof ObserverRing];

            if (expectedRing !== ringNumber) {
                errors.push({
                    file: relativePath,
                    error: 'Ring in directory does not match ring in code',
                    expected: `Ring ${expectedRing} (ObserverRing.${ringName})`,
                    actual: `Ring ${ringNumber} (directory)`
                });
            }
        }

        // Check priority matches
        if (filenamePriority !== codePriority) {
            errors.push({
                file: relativePath,
                error: 'Priority in filename does not match priority in code',
                expected: codePriority,
                actual: filenamePriority
            });
        }

        // Check if priority is explicitly set (warn if using default 50)
        if (!priorityMatch && filenamePriority !== 50) {
            warnings.push(
                `File ${relativePath} has priority ${filenamePriority} in filename but no explicit priority in code (defaults to 50)`
            );
        }
    }

    /**
     * Format validation errors for display
     */
    static formatErrors(result: ValidationResult): string {
        const lines: string[] = [];

        if (result.errors.length > 0) {
            lines.push('\nObserver Validation Errors:');
            lines.push('='.repeat(80));

            for (const error of result.errors) {
                lines.push(`\nFile: ${error.file}`);
                lines.push(`Error: ${error.error}`);
                if (error.expected !== undefined) {
                    lines.push(`Expected: ${error.expected}`);
                }
                if (error.actual !== undefined) {
                    lines.push(`Actual: ${error.actual}`);
                }
            }
        }

        if (result.warnings.length > 0) {
            lines.push('\nObserver Validation Warnings:');
            lines.push('-'.repeat(80));
            for (const warning of result.warnings) {
                lines.push(`- ${warning}`);
            }
        }

        return lines.join('\n');
    }
}
