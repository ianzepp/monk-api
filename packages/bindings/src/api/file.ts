import type { MonkClient } from '../client.js';
import type {
  ApiResponse,
  ListOptions,
  ListResponse,
  RetrieveOptions,
  RetrieveResponse,
  StoreOptions,
  StoreResponse,
  DeleteOptions,
  DeleteResponse,
  StatResponse,
  SizeResponse,
  ModifyTimeResponse,
} from '../types/index.js';

export class FileAPI {
  constructor(private client: MonkClient) {}

  async list(path: string, options?: ListOptions): Promise<ApiResponse<ListResponse>> {
    return this.client.post<ListResponse>('/api/file/list', {
      path,
      file_options: options || {},
    });
  }

  async retrieve<T = any>(
    path: string,
    options?: RetrieveOptions
  ): Promise<ApiResponse<RetrieveResponse<T>>> {
    return this.client.post<RetrieveResponse<T>>('/api/file/retrieve', {
      path,
      file_options: options || {},
    });
  }

  async store(
    path: string,
    content: any,
    options?: StoreOptions
  ): Promise<ApiResponse<StoreResponse>> {
    return this.client.post<StoreResponse>('/api/file/store', {
      path,
      content,
      file_options: options || {},
    });
  }

  async delete(path: string, options?: DeleteOptions): Promise<ApiResponse<DeleteResponse>> {
    return this.client.post<DeleteResponse>('/api/file/delete', {
      path,
      file_options: options || {},
    });
  }

  async stat(path: string): Promise<ApiResponse<StatResponse>> {
    return this.client.post<StatResponse>('/api/file/stat', { path });
  }

  async size(path: string): Promise<ApiResponse<SizeResponse>> {
    return this.client.post<SizeResponse>('/api/file/size', { path });
  }

  async modifyTime(path: string): Promise<ApiResponse<ModifyTimeResponse>> {
    return this.client.post<ModifyTimeResponse>('/api/file/modify-time', { path });
  }
}
