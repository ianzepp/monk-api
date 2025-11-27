/**
 * Monk API Client for TTY
 *
 * Supports both in-process (Hono app) and HTTP modes.
 */

import type { Hono } from 'hono';
import type { Session } from './types.js';

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    error_code?: string;
}

// Shared Hono app reference for in-process calls
let honoApp: Hono | null = null;

/**
 * Set the Hono app for in-process API calls.
 * When set, ApiClient will bypass network and call Hono directly.
 */
export function setHonoApp(app: Hono): void {
    honoApp = app;
}

/**
 * API client bound to a session's auth context
 */
export class ApiClient {
    constructor(
        private baseUrl: string,
        private session: Session
    ) {}

    private get headers(): Record<string, string> {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (this.session.token) {
            h['Authorization'] = `Bearer ${this.session.token}`;
        }
        return h;
    }

    /**
     * Make a request - in-process if Hono app is set, otherwise HTTP
     */
    private async request(method: string, path: string, body?: any, requireAuth = true): Promise<Response> {
        const url = honoApp
            ? `http://localhost${path}`  // In-process: host doesn't matter
            : `${this.baseUrl}${path}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (requireAuth && this.session.token) {
            headers['Authorization'] = `Bearer ${this.session.token}`;
        }

        const init: RequestInit = { method, headers };
        if (body !== undefined) {
            init.body = JSON.stringify(body);
        }

        if (honoApp) {
            // In-process call via Hono
            const request = new Request(url, init);
            return honoApp.fetch(request);
        } else {
            // Network call
            return fetch(url, init);
        }
    }

    /**
     * Login and get JWT token
     */
    async login(tenant: string, username: string, password: string): Promise<ApiResponse<{ token: string }>> {
        const res = await this.request('POST', '/auth/login', { tenant, username, password }, false);
        return await res.json() as ApiResponse<{ token: string }>;
    }

    /**
     * List all models (for root ls)
     */
    async listModels(): Promise<ApiResponse<string[]>> {
        const res = await this.request('GET', '/api/describe');
        const json = await res.json() as ApiResponse<string[]>;
        if (json.success && json.data) {
            // data is already an array of model names
            return { success: true, data: json.data };
        }
        return { success: false, error: json.error || 'Failed to list models' };
    }

    /**
     * List records in a model
     */
    async listRecords(model: string, limit = 100): Promise<ApiResponse<any[]>> {
        const res = await this.request('GET', `/api/data/${model}?limit=${limit}`);
        return await res.json() as ApiResponse<any[]>;
    }

    /**
     * Get a single record
     */
    async getRecord(model: string, id: string | number): Promise<ApiResponse<any>> {
        const res = await this.request('GET', `/api/data/${model}/${id}`);
        return await res.json() as ApiResponse<any>;
    }

    /**
     * Create a record
     */
    async createRecord(model: string, data: any): Promise<ApiResponse<any>> {
        const res = await this.request('POST', `/api/data/${model}`, [data]);
        const json = await res.json() as ApiResponse<any[]>;
        // Unwrap array response
        if (json.success && Array.isArray(json.data)) {
            return { success: true, data: json.data[0] };
        }
        return json as ApiResponse<any>;
    }

    /**
     * Update a record
     */
    async updateRecord(model: string, id: string | number, data: any): Promise<ApiResponse<any>> {
        const res = await this.request('PUT', `/api/data/${model}/${id}`, data);
        return await res.json() as ApiResponse<any>;
    }

    /**
     * Delete a record
     */
    async deleteRecord(model: string, id: string | number): Promise<ApiResponse<any>> {
        const res = await this.request('DELETE', `/api/data/${model}/${id}`);
        return await res.json() as ApiResponse<any>;
    }

    /**
     * Find records with query
     */
    async findRecords(model: string, query: any): Promise<ApiResponse<any[]>> {
        const res = await this.request('POST', `/api/find/${model}`, query);
        return await res.json() as ApiResponse<any[]>;
    }

    /**
     * Describe a model's schema
     */
    async describeModel(model: string): Promise<ApiResponse<any>> {
        const res = await this.request('GET', `/api/describe/${model}`);
        return await res.json() as ApiResponse<any>;
    }

    /**
     * Run aggregate query
     */
    async aggregate(model: string, pipeline: any): Promise<ApiResponse<any>> {
        const res = await this.request('POST', `/api/aggregate/${model}`, pipeline);
        return await res.json() as ApiResponse<any>;
    }
}
