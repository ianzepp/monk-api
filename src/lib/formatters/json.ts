/**
 * JSON Formatter
 *
 * Standard JSON encoding/decoding wrapper.
 */

export const JsonFormatter = {
    /**
     * Encode data to JSON string
     */
    encode(data: any): string {
        return JSON.stringify(data, null, 2);
    },

    /**
     * Decode JSON string to data
     */
    decode(text: string): any {
        return JSON.parse(text);
    },

    /**
     * Content-Type for responses
     */
    contentType: 'application/json; charset=utf-8'
};
