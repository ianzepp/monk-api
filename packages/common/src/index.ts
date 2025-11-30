/**
 * @monk/common - Shared interfaces and utilities for Monk packages
 *
 * This package provides common type definitions and helper functions
 * used across multiple @monk/* packages.
 */

/**
 * Formatter interface for data serialization/deserialization
 *
 * All formatters work with Uint8Array to support both text and binary formats.
 * Use the provided helper functions for text conversion.
 */
export interface Formatter {
    /**
     * Encode data to bytes
     * @param data - The data to encode (typically an object or array)
     * @returns Encoded data as Uint8Array
     */
    encode(data: any): Uint8Array;

    /**
     * Decode bytes to data
     * @param data - The bytes to decode
     * @returns Decoded data (typically an object or array)
     */
    decode(data: Uint8Array): any;

    /**
     * MIME content type for this format
     * Used in Content-Type headers
     */
    contentType: string;
}

/**
 * Text encoding utilities
 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Convert a string to Uint8Array (UTF-8)
 */
export function toBytes(text: string): Uint8Array {
    return textEncoder.encode(text);
}

/**
 * Convert Uint8Array to string (UTF-8)
 */
export function fromBytes(data: Uint8Array): string {
    return textDecoder.decode(data);
}

/**
 * Convert Uint8Array to base64 string
 */
export function toBase64(data: Uint8Array): string {
    return Buffer.from(data).toString('base64');
}

/**
 * Convert base64 string to Uint8Array
 */
export function fromBase64(base64: string): Uint8Array {
    const buffer = Buffer.from(base64, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
