import type { ApiResponse, MonkClientConfig } from './types/index.js';

export interface RequestConfig {
  data?: any;
}

export class MonkClient {
  private baseUrl: string;
  private timeout: number;
  private token: string | null = null;

  constructor(config: MonkClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout || 30000;
  }

  setToken(token: string): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  clearToken(): void {
    this.token = null;
  }

  private async request<T>(method: string, url: string, data?: any): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (data !== undefined) {
        init.body = JSON.stringify(data);
      }

      const response = await fetch(`${this.baseUrl}${url}`, init);
      const json = await response.json();
      return json as ApiResponse<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(url: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', url);
  }

  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>('POST', url, data);
  }

  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', url, data);
  }

  async delete<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', url, config?.data);
  }
}
