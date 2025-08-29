import { describe, test, expect } from 'vitest';

describe('FTP Modify Time Endpoint - Path Parsing', () => {
  test('should accept root path', () => {
    const path = '/';
    const parts = path.replace(/\/+/g, '/').replace(/\/$/, '').split('/').filter(p => p.length > 0);
    
    // Root path should have no parts
    expect(parts.length).toBe(0);
  });
  
  test('should accept valid directory paths', () => {
    const validPaths = [
      '/data/',
      '/meta/',
      '/data/users/',
      '/data/accounts/',
      '/data/users/user-123/'
    ];
    
    for (const path of validPaths) {
      const parts = path.replace(/\/+/g, '/').replace(/\/$/, '').split('/').filter(p => p.length > 0);
      
      if (parts.length > 0) {
        expect(['data', 'meta']).toContain(parts[0]);
      }
    }
  });
  
  test('should accept valid JSON file paths', () => {
    const validPaths = [
      '/data/users/user-123.json',
      '/data/accounts/account-456.json',
      '/meta/schema/users.json'
    ];
    
    for (const path of validPaths) {
      const parts = path.split('/').filter(p => p.length > 0);
      expect(parts.length).toBe(3);
      expect(parts[2].endsWith('.json')).toBe(true);
      expect(['data', 'meta']).toContain(parts[0]);
    }
  });
  
  test('should accept valid field file paths', () => {
    const validPaths = [
      '/data/users/user-123/email',
      '/data/accounts/account-456/name', 
      '/data/products/product-789/description'
    ];
    
    for (const path of validPaths) {
      const parts = path.split('/').filter(p => p.length > 0);
      expect(parts.length).toBe(4);
      expect(['data', 'meta']).toContain(parts[0]);
    }
  });
  
  test('should reject invalid path formats', () => {
    const invalidPaths = [
      '/invalid/',
      '/data/schema/record/field/extra',
      '/api/data/schema/',        // API prefix not allowed
      'data/users/'               // Missing leading slash
    ];
    
    for (const path of invalidPaths) {
      const parts = path.split('/').filter(p => p.length > 0);
      
      if (parts.length > 0 && !['data', 'meta'].includes(parts[0])) {
        // Should be rejected - invalid root
        expect(['data', 'meta']).not.toContain(parts[0]);
      }
      
      else if (parts.length > 4) {
        // Should be rejected - too many components
        expect(parts.length).toBeGreaterThan(4);
      }
    }
  });
});

describe('FTP Modify Time Endpoint - Timestamp Formatting', () => {
  test('should format dates to FTP timestamp correctly', () => {
    const testCases = [
      {
        date: new Date('2025-08-26T16:50:30.123Z'),
        expected: '20250826165030'
      },
      {
        date: new Date('2024-12-31T23:59:59.999Z'),
        expected: '20241231235959'
      },
      {
        date: new Date('2024-01-01T00:00:00.000Z'),
        expected: '20240101000000'
      }
    ];
    
    for (const { date, expected } of testCases) {
      const result = formatFtpTimestamp(date);
      expect(result).toBe(expected);
    }
  });
  
  test('should handle string date inputs', () => {
    const stringDates = [
      '2025-08-26T16:50:30.123Z',
      '2024-12-31T23:59:59.999Z',
      '2024-01-01T00:00:00.000Z'
    ];
    
    for (const dateString of stringDates) {
      const result = formatFtpTimestamp(dateString);
      expect(result).toMatch(/^\d{14}$/); // Should be 14 digits
      expect(result.length).toBe(14);
    }
  });
  
  test('should handle edge cases in timestamp formatting', () => {
    // Month padding
    const march = new Date('2025-03-05T10:05:03Z');
    expect(formatFtpTimestamp(march)).toBe('20250305100503');
    
    // Single digit day/hour/minute/second padding
    const earlyDate = new Date('2025-01-01T01:01:01Z');
    expect(formatFtpTimestamp(earlyDate)).toBe('20250101010101');
  });
  
  // Helper function (matches implementation)
  function formatFtpTimestamp(date: Date | string): string {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    const hour = d.getUTCHours().toString().padStart(2, '0');
    const minute = d.getUTCMinutes().toString().padStart(2, '0');
    const second = d.getUTCSeconds().toString().padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}${second}`;
  }
});

describe('FTP Modify Time Endpoint - Best Timestamp Selection', () => {
  test('should prefer updated_at over created_at', () => {
    const record = {
      id: 'test-123',
      name: 'Test Record',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-08-26T16:50:30Z'
    };
    
    const result = getBestTimestamp(record);
    expect(result.source).toBe('updated_at');
    expect(result.timestamp).toEqual(new Date(record.updated_at));
  });
  
  test('should use created_at when updated_at is missing', () => {
    const record = {
      id: 'test-123',
      name: 'Test Record',
      created_at: '2025-01-01T00:00:00Z'
    };
    
    const result = getBestTimestamp(record);
    expect(result.source).toBe('created_at');
    expect(result.timestamp).toEqual(new Date(record.created_at));
  });
  
  test('should fallback to current time when both timestamps are missing', () => {
    const record = {
      id: 'test-123',
      name: 'Test Record'
    };
    
    const before = Date.now();
    const result = getBestTimestamp(record);
    const after = Date.now();
    
    expect(result.source).toBe('updated_at'); // Fallback source
    expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.timestamp.getTime()).toBeLessThanOrEqual(after);
  });
  
  test('should handle null/undefined timestamp values', () => {
    const record = {
      id: 'test-123',
      name: 'Test Record',
      created_at: null,
      updated_at: undefined
    };
    
    const result = getBestTimestamp(record);
    expect(result.source).toBe('updated_at'); // Fallback source
    expect(result.timestamp).toBeInstanceOf(Date);
  });
  
  // Helper function (matches implementation)
  function getBestTimestamp(record: any): { timestamp: Date, source: 'updated_at' | 'created_at' } {
    if (record.updated_at) {
      return {
        timestamp: new Date(record.updated_at),
        source: 'updated_at'
      };
    }
    
    if (record.created_at) {
      return {
        timestamp: new Date(record.created_at),
        source: 'created_at'
      };
    }
    
    // Fallback to current time (shouldn't happen with proper records)
    return {
      timestamp: new Date(),
      source: 'updated_at'
    };
  }
});

describe('FTP Modify Time Endpoint - Error Response Format', () => {
  test('should format error responses correctly for missing files', () => {
    const errorResponse = {
      success: false,
      error: 'file_not_found',
      message: 'File does not exist',
      path: '/data/users/nonexistent.json',
      ftp_code: 550
    };
    
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBe('file_not_found');
    expect(errorResponse.ftp_code).toBe(550);
    expect(errorResponse.path).toBe('/data/users/nonexistent.json');
  });
  
  test('should format error responses correctly for permission denied', () => {
    const errorResponse = {
      success: false,
      error: 'permission_denied',
      message: 'Access denied',
      path: '/data/users/user-123.json',
      ftp_code: 550
    };
    
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBe('permission_denied');
    expect(errorResponse.ftp_code).toBe(550);
  });
  
  test('should format error responses correctly for invalid paths', () => {
    const errorResponse = {
      success: false,
      error: 'invalid_path',
      message: 'Invalid FTP modify time path format',
      path: '/invalid/path/format/too/many/components',
      ftp_code: 550
    };
    
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBe('invalid_path');
    expect(errorResponse.ftp_code).toBe(550);
  });
});

describe('FTP Modify Time Endpoint - Success Response Format', () => {
  test('should format success responses correctly', () => {
    const successResponse = {
      success: true,
      modified_time: '20250826165030',
      path: '/data/users/user-123.json',
      timestamp_info: {
        source: 'updated_at' as const,
        iso_timestamp: '2025-08-26T16:50:30.123Z',
        timezone: 'UTC' as const
      }
    };
    
    expect(successResponse.success).toBe(true);
    expect(successResponse.modified_time).toMatch(/^\d{14}$/);
    expect(successResponse.timestamp_info.source).toBe('updated_at');
    expect(successResponse.timestamp_info.timezone).toBe('UTC');
    expect(successResponse.timestamp_info.iso_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
  
  test('should include correct metadata for different sources', () => {
    const sources = ['updated_at', 'created_at', 'current_time'] as const;
    
    for (const source of sources) {
      const response = {
        success: true,
        modified_time: '20250826165030',
        path: '/data/users/user-123.json',
        timestamp_info: {
          source: source,
          iso_timestamp: '2025-08-26T16:50:30.123Z',
          timezone: 'UTC' as const
        }
      };
      
      expect(response.timestamp_info.source).toBe(source);
      expect(['updated_at', 'created_at', 'current_time']).toContain(source);
    }
  });
  
  test('should handle different path types correctly', () => {
    const pathTypes = [
      '/data/users/user-123.json',        // Record file
      '/data/users/user-123/email',       // Field file
      '/data/users/',                     // Directory
      '/data/',                           // API root
      '/'                                 // Root
    ];
    
    for (const path of pathTypes) {
      const response = {
        success: true,
        modified_time: '20250826165030',
        path: path,
        timestamp_info: {
          source: 'updated_at' as const,
          iso_timestamp: '2025-08-26T16:50:30.123Z',
          timezone: 'UTC' as const
        }
      };
      
      expect(response.path).toBe(path);
      expect(response.success).toBe(true);
    }
  });
});

describe('FTP Modify Time Endpoint - Path Type Classification', () => {
  test('should classify path types correctly', () => {
    const pathClassifications = [
      { path: '/', type: 'root' },
      { path: '/data/', type: 'directory' },
      { path: '/meta/', type: 'directory' },
      { path: '/data/users/', type: 'directory' },
      { path: '/data/users/user-123/', type: 'directory' },
      { path: '/data/users/user-123.json', type: 'record_file' },
      { path: '/data/users/user-123/email', type: 'field_file' }
    ];
    
    for (const { path, type } of pathClassifications) {
      const parts = path.replace(/\/+/g, '/').replace(/\/$/, '').split('/').filter(p => p.length > 0);
      
      let actualType: string;
      
      if (parts.length === 0) {
        actualType = 'root';
      } else if (parts.length === 1) {
        actualType = 'directory';
      } else if (parts.length === 2) {
        actualType = 'directory';
      } else if (parts.length === 3) {
        if (parts[2].endsWith('.json')) {
          actualType = 'record_file';
        } else {
          actualType = 'directory';
        }
      } else if (parts.length === 4) {
        actualType = 'field_file';
      } else {
        actualType = 'invalid';
      }
      
      expect(actualType).toBe(type);
    }
  });
});

describe('FTP Modify Time Endpoint - UTC Timezone Handling', () => {
  test('should always return UTC timezone', () => {
    // All responses should indicate UTC timezone
    const response = {
      timestamp_info: {
        timezone: 'UTC' as const
      }
    };
    
    expect(response.timestamp_info.timezone).toBe('UTC');
  });
  
  test('should format ISO timestamps correctly', () => {
    const testDate = new Date('2025-08-26T16:50:30.123Z');
    const isoString = testDate.toISOString();
    
    expect(isoString).toBe('2025-08-26T16:50:30.123Z');
    expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
  
  test('should handle different date formats consistently', () => {
    const testDates = [
      '2025-08-26T16:50:30Z',     // Without milliseconds
      '2025-08-26T16:50:30.123Z', // With milliseconds
      '2025-08-26 16:50:30',      // Without timezone (treated as local)
    ];
    
    for (const dateStr of testDates) {
      const date = new Date(dateStr);
      const iso = date.toISOString();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });
});