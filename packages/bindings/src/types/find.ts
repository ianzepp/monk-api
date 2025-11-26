export interface ComparisonOperators {
  $eq?: any;
  $ne?: any;
  $gt?: any;
  $gte?: any;
  $lt?: any;
  $lte?: any;
}

export interface ArrayOperators {
  $in?: any[];
  $nin?: any[];
  $any?: any[];
  $all?: any[];
  $nany?: any[];
  $nall?: any[];
  $size?: number | ComparisonOperators;
}

export interface PatternOperators {
  $like?: string;
  $nlike?: string;
  $ilike?: string;
  $regex?: string;
  $nregex?: string;
}

export interface TextOperators {
  $text?: string;
  $search?: {
    fields?: string[];
    query: string;
    operator?: 'and' | 'or';
  };
}

export interface RangeOperators {
  $between?: [any, any];
}

export interface ExistenceOperators {
  $exists?: boolean;
  $null?: boolean;
}

export type FieldOperators =
  | ComparisonOperators
  | ArrayOperators
  | PatternOperators
  | TextOperators
  | RangeOperators
  | ExistenceOperators;

export interface WhereCondition {
  [field: string]: any | FieldOperators;
}

export interface LogicalOperators {
  $and?: WhereCondition[];
  $or?: WhereCondition[];
  $not?: WhereCondition;
  $nand?: WhereCondition[];
  $nor?: WhereCondition[];
}

export type FindWhere = WhereCondition & LogicalOperators;

export interface FindQuery {
  where?: FindWhere;
  limit?: number;
  offset?: number;
  order?: string | string[] | Array<{ column: string; sort: 'asc' | 'desc' }>;
  include_trashed?: boolean;
  include_deleted?: boolean;
  context?: 'api' | 'observer' | 'system';
  select?: string[];
  hint?: string[];
}

export interface FindResponse<T = any> {
  data: T[];
  count?: number;
}
