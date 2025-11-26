import type { MonkClient } from '../client.js';
import type { ApiResponse, AggregateQuery, AggregateResult } from '../types/index.js';

export class AggregateAPI {
  constructor(private client: MonkClient) {}

  async aggregate(
    schema: string,
    query: AggregateQuery
  ): Promise<ApiResponse<AggregateResult[]>> {
    return this.client.post<AggregateResult[]>(`/api/aggregate/${schema}`, query);
  }
}
