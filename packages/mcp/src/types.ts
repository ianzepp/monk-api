/**
 * MCP Types
 */

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, any>;
    id: string | number;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export interface McpSession {
    token: string | null;
    tenant: string | null;
}

export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}
