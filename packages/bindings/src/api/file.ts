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

interface FsTransportResponse {
  ok: boolean;
  status: number;
  body: string;
  parsed?: unknown;
}

type FsStatPayload = {
  name?: unknown;
  type?: unknown;
  size?: unknown;
  mode?: unknown;
  mtime?: unknown;
  ctime?: unknown;
};

type FsDirectoryEntry = {
  name?: unknown;
  type?: unknown;
  size?: unknown;
  mode?: unknown;
  mtime?: unknown;
  ctime?: unknown;
};

type FsDirectoryPayload = {
  type?: unknown;
  path?: unknown;
  entries?: unknown;
};

export class FileAPI {
  constructor(private client: MonkClient) {}

  private normalizePath(path: string): string {
    if (!path) {
      return '/';
    }

    return path.startsWith('/') ? path : `/${path}`;
  }

  private encodePath(path: string): string {
    return this.normalizePath(path)
      .split('/')
      .map((segment, index) => (index === 0 ? '' : encodeURIComponent(segment)))
      .join('/');
  }

  private buildFsUrl(path: string, stat = false): string {
    const normalizedPath = this.encodePath(path);
    const query = new URLSearchParams();

    if (stat) {
      query.set('stat', 'true');
    }

    const queryString = query.toString();
    return `/fs${normalizedPath}${queryString ? `?${queryString}` : ''}`;
  }

  private parseJson(body: string): unknown {
    if (!body) {
      return undefined;
    }

    try {
      return JSON.parse(body);
    } catch {
      return undefined;
    }
  }

  private async requestFs(
    path: string,
    method: 'GET' | 'PUT' | 'DELETE',
    body?: string,
    stat = false
  ): Promise<FsTransportResponse> {
    const internalClient = this.client as unknown as { baseUrl: string; timeout?: number };
    const token = this.client.getToken();
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (method === 'PUT' && body !== undefined) {
      headers['Content-Type'] = 'text/plain; charset=utf-8';
    }

    const controller = new AbortController();
    const timeout = internalClient.timeout ?? 30000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${internalClient.baseUrl}${this.buildFsUrl(path, stat)}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const rawBody = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        body: rawBody,
        parsed: this.parseJson(rawBody),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';

      return {
        ok: false,
        status: 0,
        body: message,
        parsed: { error: 'REQUEST_FAILED', message },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildErrorResponse<T>(status: number, body: unknown, parsed?: unknown): ApiResponse<T> {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const errorPayload = parsed as Record<string, unknown>;
      const error = typeof errorPayload.message === 'string'
        ? errorPayload.message
        : `Request failed with status ${status}`;
      const errorCode =
        typeof errorPayload.error === 'string'
          ? errorPayload.error
          : typeof errorPayload.error_code === 'string'
            ? errorPayload.error_code
            : undefined;

      return {
        success: false,
        error,
        error_code: errorCode,
      };
    }

    return {
      success: false,
      error: `Request failed with status ${status}: ${String(body)}`,
      error_code: status === 0 ? 'REQUEST_FAILED' : 'HTTP_ERROR',
    };
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toModeString(mode: unknown): string {
    if (typeof mode === 'string') {
      return mode;
    }

    if (typeof mode === 'number' && Number.isFinite(mode)) {
      return mode.toString(8);
    }

    return '000';
  }

  private toIso(value: unknown): string {
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
      return value;
    }
    return new Date().toISOString();
  }

  private buildStatMetadata(rawStat: FsStatPayload, fallbackPath: string): StatResponse {
    const fileType: 'file' | 'directory' = rawStat.type === 'directory' ? 'directory' : 'file';

    return {
      file_metadata: {
        path: fallbackPath,
        type: fileType,
        permissions: this.toModeString(rawStat.mode),
        size: this.toNumber(rawStat.size),
        modified_time: this.toIso(rawStat.mtime),
        created_time: rawStat.ctime !== undefined ? this.toIso(rawStat.ctime) : undefined,
        access_time: undefined,
      },
    };
  }

  private inferFileType(entryType: unknown): 'f' | 'd' {
    return typeof entryType === 'string' && entryType === 'directory' ? 'd' : 'f';
  }

  private normalizeEntryPath(basePath: string, name: string): string {
    if (!name) {
      return basePath;
    }

    if (basePath === '/') {
      return `/${name}`;
    }

    return `${basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}/${name}`;
  }

  private async statInternal(path: string): Promise<ApiResponse<StatResponse>> {
    const response = await this.requestFs(path, 'GET', undefined, true);
    const parsed = response.parsed;

    if (!response.ok) {
      return this.buildErrorResponse<StatResponse>(response.status, response.body, parsed);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return this.buildErrorResponse<StatResponse>(response.status, 'Invalid stat response');
    }

    return {
      success: true,
      data: this.buildStatMetadata(parsed as FsStatPayload, this.normalizePath(path)),
    };
  }

  async list(path: string, options?: ListOptions): Promise<ApiResponse<ListResponse>> {
    const normalizedPath = this.normalizePath(path);
    const response = await this.requestFs(normalizedPath, 'GET');
    const parsed = response.parsed;

    if (!response.ok) {
      return this.buildErrorResponse<ListResponse>(response.status, response.body, parsed);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return this.buildErrorResponse<ListResponse>(response.status, 'Invalid listing response', parsed);
    }

    const payload = parsed as FsDirectoryPayload;
    if (payload.type !== 'directory') {
      return {
        success: false,
        error: 'Path points to a file, not a directory',
        error_code: 'NOT_A_DIRECTORY',
      };
    }

    const directory = payload;
    if (!Array.isArray(directory.entries)) {
      return this.buildErrorResponse<ListResponse>(response.status, 'Directory listing shape is invalid', parsed);
    }

    const entries = directory.entries
      .filter((entry): entry is FsDirectoryEntry => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        name: typeof entry.name === 'string' ? entry.name : '',
        file_type: this.inferFileType(entry.type),
        file_size: this.toNumber(entry.size),
        file_permissions: this.toModeString(entry.mode),
        file_modified: this.toIso(entry.mtime),
        path: this.normalizeEntryPath(
          typeof directory.path === 'string' ? directory.path : normalizedPath,
          typeof entry.name === 'string' ? entry.name : ''
        ),
      }));

    const statResponse = await this.statInternal(normalizedPath);
    const fileMetadata =
      statResponse.success && statResponse.data
        ? statResponse.data.file_metadata
        : {
            path: normalizedPath,
            type: 'directory' as const,
            permissions: '000',
            size: 0,
            modified_time: new Date().toISOString(),
          };

    return {
      success: true,
      data: {
        entries,
        total: entries.length,
        has_more: false,
        file_metadata: fileMetadata,
      },
    };
  }

  async retrieve<T = any>(
    path: string,
    options?: RetrieveOptions
  ): Promise<ApiResponse<RetrieveResponse<T>>> {
    const normalizedPath = this.normalizePath(path);
    const statResponse = await this.statInternal(normalizedPath);

    if (!statResponse.success || !statResponse.data) {
      return this.buildErrorResponse<RetrieveResponse<T>>(500, 'Failed to read metadata', statResponse);
    }

    if (statResponse.data.file_metadata.type === 'directory') {
      return {
        success: false,
        error: 'Path points to a directory, not a file',
        error_code: 'NOT_A_FILE',
      };
    }

    const response = await this.requestFs(normalizedPath, 'GET');
    if (!response.ok) {
      return this.buildErrorResponse<RetrieveResponse<T>>(response.status, response.body, response.parsed);
    }

    if (options?.format === 'json') {
      const parsed = response.parsed;
      if (parsed === undefined) {
        return {
          success: false,
          error: 'Response is not valid JSON',
          error_code: 'INVALID_JSON',
        };
      }

      return {
        success: true,
        data: {
          content: parsed as T,
          file_metadata: statResponse.data.file_metadata,
        },
      };
    }

    return {
      success: true,
      data: {
        content: response.body as T,
        file_metadata: statResponse.data.file_metadata,
      },
    };
  }

  private encodeStoreContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (content instanceof Uint8Array) {
      return new TextDecoder().decode(content);
    }

    return JSON.stringify(content);
  }

  async store(
    path: string,
    content: any,
    options?: StoreOptions
  ): Promise<ApiResponse<StoreResponse>> {
    const normalizedPath = this.normalizePath(path);
    const beforeStore = await this.statInternal(normalizedPath);
    const existed = beforeStore.success;

    if (options?.overwrite === false && existed) {
      return {
        success: false,
        error: 'Overwrite is disabled and target already exists',
        error_code: 'OVERWRITE_DISABLED',
      };
    }

    let payload = this.encodeStoreContent(content);

    if (options?.append_mode && existed) {
      const current = await this.retrieve<string>(normalizedPath, { format: 'raw' });
      if (!current.success || typeof current.data?.content !== 'string') {
        return {
          success: false,
          error: 'Failed to append to existing file',
          error_code: 'APPEND_FAILED',
        };
      }

      payload = `${current.data.content}${payload}`;
    }

    const response = await this.requestFs(normalizedPath, 'PUT', payload);
    if (!response.ok) {
      return this.buildErrorResponse<StoreResponse>(response.status, response.body, response.parsed);
    }

    const statResponse = await this.statInternal(normalizedPath);
      const fileMetadata =
      statResponse.success && statResponse.data
        ? statResponse.data.file_metadata
        : {
            path: normalizedPath,
            type: 'file' as const,
            permissions: '000',
            size: payload.length,
            modified_time: new Date().toISOString(),
          };

    return {
      success: true,
      data: {
        operation: 'store',
        result: {
          created: !existed,
          updated: existed,
          validation_passed: options?.validate_schema ?? undefined,
        },
        file_metadata: fileMetadata,
      },
    };
  }

  async delete(path: string, options?: DeleteOptions): Promise<ApiResponse<DeleteResponse>> {
    const normalizedPath = this.normalizePath(path);
    const response = await this.requestFs(normalizedPath, 'DELETE');

    if (!response.ok) {
      return this.buildErrorResponse<DeleteResponse>(response.status, response.body, response.parsed);
    }

    const results: DeleteResponse['results'] = {
      deleted_count: 1,
      paths: [normalizedPath],
      records_affected: undefined,
      fields_cleared: undefined,
    };

    if (options?.permanent) {
      results.records_affected = ['Permanent delete is not explicitly modeled by /fs endpoint'];
    }

    return {
      success: true,
      data: {
        operation: 'delete',
        results,
      },
    };
  }

  async stat(path: string): Promise<ApiResponse<StatResponse>> {
    const normalizedPath = this.normalizePath(path);
    return this.statInternal(normalizedPath);
  }

  async size(path: string): Promise<ApiResponse<SizeResponse>> {
    const response = await this.statInternal(this.normalizePath(path));
    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error,
        error_code: response.error_code,
      };
    }

    return {
      success: true,
      data: {
        size: response.data.file_metadata.size,
        file_metadata: response.data.file_metadata,
      },
    };
  }

  async modifyTime(path: string): Promise<ApiResponse<ModifyTimeResponse>> {
    const response = await this.statInternal(this.normalizePath(path));
    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error,
        error_code: response.error_code,
      };
    }

    return {
      success: true,
      data: {
        modified_time: response.data.file_metadata.modified_time,
        file_metadata: response.data.file_metadata,
        timestamp_info: {
          source: 'fs',
          iso_timestamp: response.data.file_metadata.modified_time,
          timezone: 'UTC',
        },
      },
    };
  }
}
