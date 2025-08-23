import { readFileSync } from 'fs';
import path from 'path';

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
        
        const configPaths = [
            './.config/monk/env.json',  // Test environment (current directory)
            `${process.env.HOME}/.config/monk/env.json`  // User environment
        ];
        
        for (const configPath of configPaths) {
            try {
                const configData = JSON.parse(readFileSync(configPath, 'utf8'));
                
                // Validate config is an object
                if (typeof configData !== 'object' || configData === null) {
                    console.warn(`⚠️  Invalid monk configuration in ${configPath}: not an object`);
                    continue;
                }
                
                // Set environment variables from config
                let loadedCount = 0;
                for (const [key, value] of Object.entries(configData)) {
                    if (!process.env[key]) {  // Don't override existing env vars
                        process.env[key] = String(value);
                        loadedCount++;
                    }
                }
                
                console.log(`📁 Loaded monk configuration from: ${configPath} (${loadedCount} variables)`);
                this.loaded = true;
                return;
                
            } catch (error) {
                // Continue to next config path
                continue;
            }
        }
        
        // No config found - use environment variables or defaults
        console.log('📁 No monk configuration found, using environment variables');
        this.loaded = true;
    }
    
    /**
     * Get configuration value with fallback
     * @param key Environment variable key
     * @param defaultValue Default value if not found
     * @returns Configuration value
     */
    static get(key: string, defaultValue?: string): string | undefined {
        this.load(); // Ensure config is loaded
        return process.env[key] || defaultValue;
    }
    
    /**
     * Check if configuration is loaded from file
     * @returns true if config was loaded from JSON file
     */
    static isConfigLoaded(): boolean {
        return this.loaded;
    }
    
    /**
     * Get expected configuration file paths
     * @returns Array of configuration file paths in order of precedence
     */
    static getConfigPaths(): string[] {
        return [
            './.config/monk/env.json',
            `${process.env.HOME}/.config/monk/env.json`
        ];
    }
}