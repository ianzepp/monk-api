export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
}

export interface MonkClientConfig {
  baseUrl: string;
  timeout?: number;
}

export interface JwtPayload {
  sub: string;
  user_id: string;
  tenant: string;
  database: string;
  access: 'user' | 'full' | 'root';
  access_read: string[];
  access_edit: string[];
  access_full: string[];
  iat: number;
  exp: number;
  is_sudo?: boolean;
  elevated_from?: string;
  elevated_at?: string;
  elevation_reason?: string;
}
