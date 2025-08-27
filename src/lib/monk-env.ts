import { readFileSync } from 'fs';
import path from 'path';
import { logger } from '@src/lib/logger.js';

/**
 * Configuration file paths in order of precedence
 */
const MONK_CONFIG_PATHS = [
    './.config/monk/env.json',  // Test environment (current directory)
    `${process.env.HOME}/.config/monk/env.json`  // User environment
];

/**
 * MonkEnv - Configuration management for Monk API
 * 
 * Loads environment configuration from JSON files in order of precedence:
 * 1. ./.config/monk/env.json (test environment - current directory)
 * 2. ~/.config/monk/env.json (user environment)
 * 3. process.env (system environment variables)
 * 
 * This approach provides:
 * - Secure configuration storage outside project directory
 * - Test environment isolation via local .config directories
 * - Consistent configuration management across monk CLI and API
 */
export class MonkEnv {
    private static loaded = false;
    
    /**
     * Load monk configuration from JSON files
     * Sets process.env variables from configuration files
     * Safe to call multiple times - only loads once
     */
    static load(): void {
        if (this.loaded) {
            return;
        }
        
        for (const configPath of MONK_CONFIG_PATHS) {
            try {
                const configData = JSON.parse(readFileSync(configPath, 'utf8'));
                
                // Validate config is an object
                if (typeof configData !== 'object' || configData === null) {
                    logger.warn('Invalid monk configuration - not an object', { configPath });
                    continue;
                }
                
                // Set environment variables from config
                let loadedCount = 0;

                for (const [key, value] of Object.entries(configData)) {
                    logger.info('Reading environment variable %s', key);

                    if (!process.env[key]) {  // Don't override existing env vars
                        process.env[key] = String(value);
                        loadedCount++;
                    }
                }
                
                logger.info('Loaded monk configuration', { configPath, variableCount: loadedCount });
                this.loaded = true;
                return;
                
            } catch (error) {
                // Continue to next config path
                continue;
            }
        }
        
        // No config found - use environment variables or defaults
        logger.info('No monk configuration found, using environment variables');
        this.loaded = true;
    }
    
    /**
     * Get configuration value with required validation
     * @param key Environment variable key
     * @param defaultValue Default value if not found (optional)
     * @param required Whether the configuration value is required (default: false)
     * @returns Configuration value
     * @throws Error if required=true and key not found
     */
    static get(key: string, defaultValue?: string, required: boolean = false): string {
        this.load(); // Ensure config is loaded
        
        const value = process.env[key] || defaultValue;
        
        if (required && !value) {
            throw new Error(
                `${key} not found in configuration. ` +
                `Ensure ~/.config/monk/env.json contains ${key}.`
            );
        }
        
        return value || '';
    }
    
    /**
     * Load configuration into process.env for server startup
     * This should be called EXACTLY ONCE during server initialization
     * Throws error if critical configuration is missing
     */
    static loadIntoProcessEnv(): void {
        this.load();
        
        // Validate critical configuration is present
        if (!process.env.DATABASE_URL) {
            throw new Error(
                'DATABASE_URL not found in configuration. ' +
                'Ensure ~/.config/monk/env.json contains DATABASE_URL.'
            );
        }
        
        logger.info('Configuration loaded into process.env for server startup');
    }
    
    /**
     * Check if configuration is loaded from file
     * @returns true if config was loaded from JSON file
     */
    static isConfigLoaded(): boolean {
        return this.loaded;
    }
    
}