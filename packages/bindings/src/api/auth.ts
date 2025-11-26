import type { MonkClient } from '../client.js';
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  RefreshRequest,
  RefreshResponse,
  TenantsResponse,
  WhoAmIResponse,
  SudoRequest,
  SudoResponse,
} from '../types/index.js';

export class AuthAPI {
  constructor(private client: MonkClient) {}

  async login(request: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    const response = await this.client.post<LoginResponse>('/auth/login', request);

    if (response.success && response.data?.token) {
      this.client.setToken(response.data.token);
    }

    return response;
  }

  async register(request: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
    const response = await this.client.post<RegisterResponse>('/auth/register', request);

    if (response.success && response.data?.token) {
      this.client.setToken(response.data.token);
    }

    return response;
  }

  async refresh(request: RefreshRequest): Promise<ApiResponse<RefreshResponse>> {
    const response = await this.client.post<RefreshResponse>('/auth/refresh', request);

    if (response.success && response.data?.token) {
      this.client.setToken(response.data.token);
    }

    return response;
  }

  async tenants(): Promise<ApiResponse<TenantsResponse>> {
    return this.client.get<TenantsResponse>('/auth/tenants');
  }

  async whoami(): Promise<ApiResponse<WhoAmIResponse>> {
    return this.client.get<WhoAmIResponse>('/api/auth/whoami');
  }

  async sudo(request?: SudoRequest): Promise<ApiResponse<SudoResponse>> {
    return this.client.post<SudoResponse>('/api/auth/sudo', request || {});
  }

  logout(): void {
    this.client.clearToken();
  }
}
