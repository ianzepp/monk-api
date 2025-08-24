import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@lib/filter-where.js';

describe('Search Operators - Comprehensive Testing', () => {
  
  describe('$find operator (Full-Text Search)', () => {
    test('basic full-text search', () => {
      const { whereClause, params } = FilterWhere.generate({
        content: { $find: 'search terms' }
      });
      
      expect(whereClause).toContain('"content" ILIKE $1');
      expect(params).toEqual(['%search terms%']);
    });

    test('single word search', () => {
      const { whereClause, params } = FilterWhere.generate({
        title: { $find: 'urgent' }
      });
      
      expect(whereClause).toContain('"title" ILIKE $1');
      expect(params).toEqual(['%urgent%']);
    });

    test('search with special characters', () => {
      const { whereClause, params } = FilterWhere.generate({
        description: { $find: "project's plan & goals" }
      });
      
      expect(whereClause).toContain('"description" ILIKE $1');
      expect(params).toEqual(["%project's plan & goals%"]);
    });

    test('empty search term', () => {
      const { whereClause, params } = FilterWhere.generate({
        content: { $find: '' }
      });
      
      expect(whereClause).toContain('"content" ILIKE $1');
      expect(params).toEqual(['%%']); // Should match everything
    });

    test('search with SQL injection attempt', () => {
      const { whereClause, params } = FilterWhere.generate({
        content: { $find: "'; DROP TABLE users; --" }
      });
      
      expect(whereClause).toContain('"content" ILIKE $1');
      expect(params).toEqual(["%'; DROP TABLE users; --%"]);
      // Parameterization should prevent injection
    });

    test('multiple field search with OR', () => {
      const searchTerm = 'important project';
      const { whereClause, params } = FilterWhere.generate({
        $or: [
          { title: { $find: searchTerm } },
          { description: { $find: searchTerm } },
          { keywords: { $find: searchTerm } }
        ]
      });
      
      expect(whereClause).toContain('"title" ILIKE $1');
      expect(whereClause).toContain('"description" ILIKE $2');
      expect(whereClause).toContain('"keywords" ILIKE $3');
      expect(params).toEqual([`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);
    });

    test('search combined with other operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { content: { $find: 'meeting notes' } },
          { status: 'published' },
          { author: { $in: ['user-123', 'user-456'] } },
          { created_at: { $gte: '2024-01-01' } }
        ]
      });
      
      expect(whereClause).toContain('"content" ILIKE $1');
      expect(whereClause).toContain('"status" = $2');
      expect(whereClause).toContain('"author" IN ($3, $4)');
      expect(whereClause).toContain('"created_at" >= $5');
      expect(params).toEqual(['%meeting notes%', 'published', 'user-123', 'user-456', '2024-01-01']);
    });
  });

  describe('$text operator (Text Search)', () => {
    test('basic text search', () => {
      const { whereClause, params } = FilterWhere.generate({
        article: { $text: 'javascript tutorial' }
      });
      
      expect(whereClause).toContain('"article" ILIKE $1');
      expect(params).toEqual(['%javascript tutorial%']);
    });

    test('text search with ranking implications', () => {
      // Note: Current implementation is basic ILIKE
      // Future enhancement could use PostgreSQL full-text search with ranking
      const { whereClause, params } = FilterWhere.generate({
        content: { $text: 'database optimization' }
      });
      
      expect(whereClause).toContain('"content" ILIKE $1');
      expect(params).toEqual(['%database optimization%']);
    });

    test('case insensitive text search', () => {
      const { whereClause, params } = FilterWhere.generate({
        title: { $text: 'PostgreSQL' }
      });
      
      expect(whereClause).toContain('"title" ILIKE $1');
      expect(params).toEqual(['%PostgreSQL%']);
      // ILIKE is case-insensitive, so 'postgresql', 'POSTGRESQL', 'PostgreSQL' all match
    });

    test('text search with logical operators', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { category: 'documentation' },
          {
            $or: [
              { title: { $text: 'API guide' } },
              { content: { $text: 'endpoint reference' } }
            ]
          }
        ]
      });
      
      expect(whereClause).toContain('"category" = $1');
      expect(whereClause).toContain('"title" ILIKE $2');
      expect(whereClause).toContain('"content" ILIKE $3');
      expect(params).toEqual(['documentation', '%API guide%', '%endpoint reference%']);
    });

    test('text search in array context', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { tags: { $any: ['tutorial', 'guide'] } },
          { content: { $text: 'beginner friendly' } }
        ]
      });
      
      expect(whereClause).toContain('"tags" && ARRAY[$1, $2]');
      expect(whereClause).toContain('"content" ILIKE $3');
      expect(params).toEqual(['tutorial', 'guide', '%beginner friendly%']);
    });
  });

  describe('Search Performance Scenarios', () => {
    test('multiple concurrent searches', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          { title: { $find: 'project' } },
          { description: { $find: 'management' } },
          { keywords: { $text: 'agile' } },
          { category: { $find: 'software' } }
        ]
      });
      
      expect(params).toEqual(['%project%', '%management%', '%agile%', '%software%']);
      expect(whereClause.split('ILIKE').length - 1).toBe(4); // 4 ILIKE operations
    });

    test('search with complex filtering', () => {
      const { whereClause, params } = FilterWhere.generate({
        $and: [
          {
            $or: [
              { title: { $text: 'tutorial' } },
              { content: { $find: 'how to' } }
            ]
          },
          { difficulty: { $in: ['beginner', 'intermediate'] } },
          { tags: { $all: ['published', 'reviewed'] } },
          { author_permissions: { $any: ['write', 'publish'] } }
        ]
      });
      
      expect(whereClause).toContain('"title" ILIKE $1');
      expect(whereClause).toContain('"content" ILIKE $2');
      expect(whereClause).toContain('"difficulty" IN ($3, $4)');
      expect(whereClause).toContain('"tags" @> ARRAY[$5, $6]');
      expect(whereClause).toContain('"author_permissions" && ARRAY[$7, $8]');
      expect(params).toEqual(['%tutorial%', '%how to%', 'beginner', 'intermediate', 'published', 'reviewed', 'write', 'publish']);
    });
  });

  describe('Search Edge Cases', () => {
    test('search with percent signs (LIKE wildcards)', () => {
      const { whereClause, params } = FilterWhere.generate({
        formula: { $find: '100% success rate' }
      });
      
      expect(whereClause).toContain('"formula" ILIKE $1');
      expect(params).toEqual(['%100% success rate%']);
      // Should work correctly even with % in search term
    });

    test('search with underscore (LIKE wildcards)', () => {
      const { whereClause, params } = FilterWhere.generate({
        code: { $find: 'user_profile_data' }
      });
      
      expect(whereClause).toContain('"code" ILIKE $1');
      expect(params).toEqual(['%user_profile_data%']);
    });

    test('search with apostrophes', () => {
      const { whereClause, params } = FilterWhere.generate({
        title: { $text: "developer's guide" }
      });
      
      expect(whereClause).toContain('"title" ILIKE $1');
      expect(params).toEqual(["%developer's guide%"]);
    });

    test('unicode search terms', () => {
      const { whereClause, params } = FilterWhere.generate({
        content: { $find: '数据库优化 database' }
      });
      
      expect(whereClause).toContain('"content" ILIKE $1');
      expect(params).toEqual(['%数据库优化 database%']);
    });

    test('very long search terms', () => {
      const longSearchTerm = 'a'.repeat(1000);
      const { whereClause, params } = FilterWhere.generate({
        content: { $find: longSearchTerm }
      });
      
      expect(whereClause).toContain('"content" ILIKE $1');
      expect(params[0]).toHaveLength(1002); // Original + 2 % characters
    });
  });

  describe('Future Enhancement Scenarios', () => {
    test('search operators ready for PostgreSQL full-text search upgrade', () => {
      // Current: ILIKE implementation
      // Future: Could be upgraded to PostgreSQL's to_tsvector/to_tsquery
      const { whereClause, params } = FilterWhere.generate({
        document: { $text: 'database performance optimization' }
      });
      
      expect(whereClause).toContain('"document" ILIKE $1');
      expect(params).toEqual(['%database performance optimization%']);
      
      // Future enhancement could generate:
      // to_tsvector('english', "document") @@ to_tsquery('english', 'database & performance & optimization')
    });

    test('find operator extensibility', () => {
      // Current: Basic ILIKE
      // Future: Could support search configuration
      const { whereClause, params } = FilterWhere.generate({
        searchable_content: { $find: 'machine learning AI' }
      });
      
      expect(whereClause).toContain('"searchable_content" ILIKE $1');
      expect(params).toEqual(['%machine learning AI%']);
    });
  });
});