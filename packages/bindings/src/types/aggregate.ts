import type { FindWhere } from './find.js';

export type AggregateFunction =
  | { $count: string | '*' }
  | { $sum: string }
  | { $avg: string }
  | { $min: string }
  | { $max: string }
  | { $distinct: string };

export interface AggregateFunctions {
  [alias: string]: AggregateFunction;
}

export interface AggregateQuery {
  aggregate: AggregateFunctions;
  groupBy?: string | string[];
  where?: FindWhere;
  context?: 'api' | 'observer' | 'system';
}

export interface AggregateResult {
  [key: string]: any;
}
