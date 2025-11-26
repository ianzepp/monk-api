import type { MonkClient } from '../client.js';
import type {
  ApiResponse,
  DataRecord,
  SelectAnyParams,
} from '../types/index.js';

export class DataAPI {
  constructor(private client: MonkClient) {}

  async selectAny<T = DataRecord>(
    schema: string,
    params?: SelectAnyParams
  ): Promise<ApiResponse<T[]>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.order) queryParams.append('order', params.order);
    if (params?.include_trashed) queryParams.append('include_trashed', 'true');

    const url = `/api/data/${schema}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.client.get<T[]>(url);
  }

  async selectOne<T = DataRecord>(schema: string, recordId: string): Promise<ApiResponse<T>> {
    return this.client.get<T>(`/api/data/${schema}/${recordId}`);
  }

  async createOne<T = DataRecord>(schema: string, data: T): Promise<ApiResponse<T>> {
    return this.client.post<T>(`/api/data/${schema}`, data);
  }

  async createAll<T = DataRecord>(schema: string, data: T[]): Promise<ApiResponse<T[]>> {
    return this.client.post<T[]>(`/api/data/${schema}`, data);
  }

  async updateOne<T = DataRecord>(
    schema: string,
    recordId: string,
    data: Partial<T>
  ): Promise<ApiResponse<T>> {
    return this.client.put<T>(`/api/data/${schema}/${recordId}`, data);
  }

  async updateAll<T = DataRecord>(
    schema: string,
    data: Array<Partial<T> & { id: string }>
  ): Promise<ApiResponse<T[]>> {
    return this.client.put<T[]>(`/api/data/${schema}`, data);
  }

  async deleteOne(schema: string, recordId: string): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/api/data/${schema}/${recordId}`);
  }

  async deleteAll(schema: string, ids: string[]): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/api/data/${schema}`, {
      data: { ids },
    });
  }

  async selectAnyRelated<T = DataRecord>(
    schema: string,
    recordId: string,
    relationship: string,
    params?: SelectAnyParams
  ): Promise<ApiResponse<T[]>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.order) queryParams.append('order', params.order);

    const url = `/api/data/${schema}/${recordId}/${relationship}${
      queryParams.toString() ? `?${queryParams.toString()}` : ''
    }`;
    return this.client.get<T[]>(url);
  }

  async selectOneRelated<T = DataRecord>(
    schema: string,
    recordId: string,
    relationship: string,
    childId: string
  ): Promise<ApiResponse<T>> {
    return this.client.get<T>(`/api/data/${schema}/${recordId}/${relationship}/${childId}`);
  }

  async createOneRelated<T = DataRecord>(
    schema: string,
    recordId: string,
    relationship: string,
    data: T
  ): Promise<ApiResponse<T>> {
    return this.client.post<T>(`/api/data/${schema}/${recordId}/${relationship}`, data);
  }

  async updateOneRelated<T = DataRecord>(
    schema: string,
    recordId: string,
    relationship: string,
    childId: string,
    data: Partial<T>
  ): Promise<ApiResponse<T>> {
    return this.client.put<T>(`/api/data/${schema}/${recordId}/${relationship}/${childId}`, data);
  }

  async deleteOneRelated(
    schema: string,
    recordId: string,
    relationship: string,
    childId: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/api/data/${schema}/${recordId}/${relationship}/${childId}`);
  }

  async deleteAllRelated(
    schema: string,
    recordId: string,
    relationship: string
  ): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/api/data/${schema}/${recordId}/${relationship}`);
  }
}
