// Firebase Query Builder - Helper for building Firestore queries

import type { QueryOptions, WhereClause, OrderByClause } from '../types';

export class FirebaseQueryBuilder {
  private whereClause: WhereClause[] = [];
  private orderByClause: OrderByClause[] = [];
  private limitValue?: number;

  /**
   * Add where condition
   */
  where(field: string, operator: any, value: any): this {
    this.whereClause.push({ field, operator, value });
    return this;
  }

  /**
   * Add order by condition
   */
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderByClause.push({ field, direction });
    return this;
  }

  /**
   * Set limit
   */
  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Build query options
   */
  build(): QueryOptions {
    return {
      where: this.whereClause.length > 0 ? this.whereClause : undefined,
      orderBy: this.orderByClause.length > 0 ? this.orderByClause : undefined,
      limit: this.limitValue
    };
  }

  /**
   * Reset builder
   */
  reset(): this {
    this.whereClause = [];
    this.orderByClause = [];
    this.limitValue = undefined;
    return this;
  }
}