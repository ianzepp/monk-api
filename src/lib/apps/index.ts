/**
 * App Package Infrastructure
 *
 * Exports utilities for loading and mounting app packages.
 */

export { createInProcessClient } from './in-process-client.js';
export type { InProcessClient, ApiResponse, RequestOptions } from './in-process-client.js';

export { loadApp, registerAppTenant, registerAppModels, discoverApps } from './loader.js';
export type { AppFactory, AppContext, AppModelDefinition } from './loader.js';
