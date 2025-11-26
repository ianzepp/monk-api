/**
 * App Package Infrastructure
 *
 * Exports utilities for loading and mounting app packages.
 */

export { createInProcessClient } from './in-process-client.js';
export type { InProcessClient, ApiResponse, RequestOptions } from './in-process-client.js';

export { loadApp, registerAppTenant, registerAppModels, getOptionalApps } from './loader.js';
export type { AppFactory, AppContext } from './loader.js';
