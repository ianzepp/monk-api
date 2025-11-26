import type { MonkClient } from '../client.js';
import type { ApiResponse, DataRecord, FindQuery, FindResponse } from '../types/index.js';

export class FindAPI {
  constructor(private client: MonkClient) {}

  async find<T = DataRecord>(schema: string, query: FindQuery = {}): Promise<ApiResponse<T[]>> {
    const response = await this.client.post<FindResponse<T>>(`/api/find/${schema}`, query);

    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.data,
      };
    }

    return {
      success: false,
      error: response.error,
      error_code: response.error_code,
    };
  }

  async findOne<T = DataRecord>(schema: string, query: FindQuery = {}): Promise<ApiResponse<T | null>> {
    const queryWithLimit = { ...query, limit: 1 };
    const response = await this.find<T>(schema, queryWithLimit);

    if (response.success && response.data) {
      return {
        success: true,
        data: response.data[0] || null,
      };
    }

    return {
      success: false,
      error: response.error,
      error_code: response.error_code,
    };
  }

  async count(schema: string, query: Omit<FindQuery, 'limit' | 'offset' | 'order' | 'select'> = {}): Promise<ApiResponse<number>> {
    const response = await this.client.post<FindResponse>(`/api/find/${schema}`, query);

    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.count || response.data.data?.length || 0,
      };
    }

    return {
      success: false,
      error: response.error,
      error_code: response.error_code,
    } as ApiResponse<number>;
  }
}
