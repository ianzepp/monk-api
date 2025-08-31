export interface JWTPayload {
    sub: string; // Subject/system identifier
    user_id: string | null; // User ID for database records (null for root/system)
    tenant: string; // Tenant name
    database: string; // Database name (converted)
    access: string; // Access level (deny/read/edit/full/root)
    access_read: string[]; // ACL read access
    access_edit: string[]; // ACL edit access
    access_full: string[]; // ACL full access
    iat: number; // Issued at
    exp: number; // Expires at
    [key: string]: any; // Index signature for Hono compatibility
}
