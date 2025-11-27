/**
 * @monk/formatter-cbor - CBOR Formatter
 *
 * CBOR (Concise Binary Object Representation) format encoding/decoding.
 * CBOR is a binary data format similar to JSON but more compact.
 * Standardized as RFC 8949.
 *
 * Use cases:
 * - IoT and constrained environments
 * - WebAuthn/FIDO2 authentication
 * - COSE (CBOR Object Signing and Encryption)
 * - Mobile apps with bandwidth constraints
 * - Binary efficiency (~30% smaller than JSON)
 */

import { encode, decode } from 'cbor-x';
import { type Formatter } from '@monk/common';

export const CborFormatter: Formatter = {
    encode(data: any): Uint8Array {
        return encode(data);
    },

    decode(data: Uint8Array): any {
        return decode(data);
    },

    contentType: 'application/cbor'
};
