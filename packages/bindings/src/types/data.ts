export interface DataRecord {
  id: string;
  [key: string]: any;
}

export interface FilterData {
  where?: Record<string, any>;
  limit?: number;
  offset?: number;
  order?: string;
  include_trashed?: boolean;
}

export interface SelectAnyParams {
  where?: Record<string, any>;
  limit?: number;
  offset?: number;
  order?: string;
  include_trashed?: boolean;
}

export interface SelectOneParams {
  where?: Record<string, any>;
  include_trashed?: boolean;
}

export interface CreateOneRequest<T = any> {
  data: T;
}

export interface CreateAllRequest<T = any> {
  data: T[];
}

export interface UpdateOneRequest<T = any> {
  data: Partial<T>;
}

export interface UpdateAllRequest<T = any> {
  data: Array<Partial<T> & { id: string }>;
}

export interface DeleteAllRequest {
  ids: string[];
}
