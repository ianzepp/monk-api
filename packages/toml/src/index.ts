/**
 * @monk/toml - TOML Formatter
 *
 * TOML (Tom's Obvious, Minimal Language) format encoding/decoding.
 * TOML is a configuration file format that's easy for humans to read and write.
 *
 * Use cases:
 * - Configuration management
 * - Infrastructure as Code (IaC) files
 * - Application settings
 * - Deployment manifests
 * - Human-readable data exchange
 */

import { parse, stringify } from '@iarna/toml';

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

export const TomlFormatter: Formatter = {
    encode(data: any): string {
        return stringify(data);
    },

    decode(text: string): any {
        return parse(text);
    },

    contentType: 'application/toml; charset=utf-8'
};
