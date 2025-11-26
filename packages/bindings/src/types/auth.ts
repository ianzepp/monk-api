export interface LoginRequest {
  tenant: string;
  username: string;
  password?: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
  tenant: string;
}

export interface RegisterRequest {
  tenant: string;
  username: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  token: string;
}

export interface TenantsResponse {
  tenants: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}

export interface WhoAmIResponse {
  user: {
    id: string;
    username: string;
    email: string;
  };
  tenant: string;
  database: string;
  access: string;
  permissions: {
    read: string[];
    edit: string[];
    full: string[];
  };
}

export interface SudoRequest {
  reason?: string;
}

export interface SudoResponse {
  root_token: string;
  expires_in: number;
  elevated_from: string;
  warning?: string;
}
