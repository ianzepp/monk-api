/**
 * YAML Formatter
 *
 * YAML format encoding/decoding wrapper.
 */

import { dump as encodeYaml, load as decodeYaml } from 'js-yaml';

export const YamlFormatter = {
    /**
     * Encode data to YAML string
     */
    encode(data: any): string {
        return encodeYaml(data, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
        });
    },

    /**
     * Decode YAML string to data
     */
    decode(text: string): any {
        return decodeYaml(text);
    },

    /**
     * Content-Type for responses
     */
    contentType: 'application/yaml; charset=utf-8'
};
