/**
 * TOML Formatter
 *
 * TOML (Tom's Obvious, Minimal Language) format encoding/decoding wrapper.
 * TOML is a configuration file format that's easy for humans to read and write.
 * 
 * Use cases:
 * - Configuration management
 * - Infrastructure as Code (IaC) files
 * - Application settings
 * - Deployment manifests
 * - Human-readable data exchange
 */

import { parse as parseToml, stringify as stringifyToml } from '@iarna/toml';

export const TomlFormatter = {
    /**
     * Encode data to TOML string
     */
    encode(data: any): string {
        return stringifyToml(data);
    },

    /**
     * Decode TOML string to data
     */
    decode(text: string): any {
        return parseToml(text);
    },

    /**
     * Content-Type for responses
     */
    contentType: 'application/toml; charset=utf-8'
};
