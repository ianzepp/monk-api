/**
 * Global type declarations for monk-api
 */

import { Logger } from '../lib/logger.js';

declare global {
    var logger: Logger;
}

export {};