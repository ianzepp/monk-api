export { MonkClient } from './client.js';
export { AuthAPI } from './api/auth.js';
export { DataAPI } from './api/data.js';
export { FindAPI } from './api/find.js';
export { FileAPI } from './api/file.js';
export { AggregateAPI } from './api/aggregate.js';
export * from './types/index.js';

import { MonkClient } from './client.js';
import { AuthAPI } from './api/auth.js';
import { DataAPI } from './api/data.js';
import { FindAPI } from './api/find.js';
import { FileAPI } from './api/file.js';
import { AggregateAPI } from './api/aggregate.js';
import type { MonkClientConfig } from './types/index.js';

export class MonkAPI {
  public client: MonkClient;
  public auth: AuthAPI;
  public data: DataAPI;
  public find: FindAPI;
  public file: FileAPI;
  public aggregate: AggregateAPI;

  constructor(config: MonkClientConfig) {
    this.client = new MonkClient(config);
    this.auth = new AuthAPI(this.client);
    this.data = new DataAPI(this.client);
    this.find = new FindAPI(this.client);
    this.file = new FileAPI(this.client);
    this.aggregate = new AggregateAPI(this.client);
  }

  setToken(token: string): void {
    this.client.setToken(token);
  }

  getToken(): string | null {
    return this.client.getToken();
  }

  clearToken(): void {
    this.client.clearToken();
  }
}
