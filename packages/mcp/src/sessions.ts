/**
 * MCP Session Management
 *
 * API-backed session storage with in-memory cache.
 * Sessions are stored in the @monk/mcp tenant's sessions model.
 */

import type { McpSession } from './types.js';

// API client interface
interface ApiClient {
    get<T = any>(path: string, query?: Record<string, string>): Promise<{ success: boolean; data?: T; error?: string }>;
    post<T = any>(path: string, body?: any): Promise<{ success: boolean; data?: T; error?: string }>;
    put<T = any>(path: string, body?: any): Promise<{ success: boolean; data?: T; error?: string }>;
}

// In-memory cache for performance
const sessionCache = new Map<string, McpSession>();

// API client reference
let client: ApiClient | null = null;

/**
 * Initialize the session manager with an API client.
 */
export function initSessions(apiClient: ApiClient): void {
    client = apiClient;
}

/**
 * Load session from API.
 */
async function loadFromApi(sessionId: string): Promise<McpSession | null> {
    if (!client) return null;

    try {
        // Query for session by session_id field
        const result = await client.post<any[]>('/api/find/sessions', {
            where: { session_id: sessionId },
            limit: 1,
        });

        if (result.success && result.data && result.data.length > 0) {
            const row = result.data[0];
            return {
                tenant: row.user_tenant || null,
                token: row.user_token || null,
            };
        }
    } catch (error) {
        console.warn('Failed to load MCP session from API:', error);
    }
    return null;
}

/**
 * Save session to API.
 */
async function saveToApi(sessionId: string, session: McpSession): Promise<void> {
    if (!client) return;

    try {
        // Check if session exists
        const existing = await client.post<any[]>('/api/find/sessions', {
            where: { session_id: sessionId },
            limit: 1,
        });

        if (existing.success && existing.data && existing.data.length > 0) {
            // Update existing session
            const recordId = existing.data[0].id;
            await client.put(`/api/data/sessions/${recordId}`, {
                user_tenant: session.tenant,
                user_token: session.token,
            });
        } else {
            // Create new session
            await client.post('/api/data/sessions', {
                session_id: sessionId,
                user_tenant: session.tenant,
                user_token: session.token,
            });
        }
    } catch (error) {
        console.warn('Failed to save MCP session to API:', error);
    }
}

/**
 * Get or create a session for the given ID.
 */
export async function getOrCreateSession(sessionId: string): Promise<McpSession> {
    // Check cache first
    const cached = sessionCache.get(sessionId);
    if (cached) {
        return cached;
    }

    // Try loading from API
    const fromApi = await loadFromApi(sessionId);
    if (fromApi) {
        sessionCache.set(sessionId, fromApi);
        return fromApi;
    }

    // Create new session (in-memory only until first update)
    const newSession: McpSession = { token: null, tenant: null };
    sessionCache.set(sessionId, newSession);
    return newSession;
}

/**
 * Update a session (cache and API).
 */
export async function updateSession(sessionId: string, session: McpSession): Promise<void> {
    sessionCache.set(sessionId, session);
    await saveToApi(sessionId, session);
}
