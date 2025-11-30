/**
 * @monk/formatter-toml - TOML Formatter
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
import { type Formatter, toBytes, fromBytes } from '@monk/common';

export const TomlFormatter: Formatter = {
    encode(data: any): Uint8Array {
        return toBytes(stringify(data));
    },

    decode(data: Uint8Array): any {
        return parse(fromBytes(data));
    },

    contentType: 'application/toml; charset=utf-8'
};
