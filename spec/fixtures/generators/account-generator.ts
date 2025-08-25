/**
 * Account Generator
 * 
 * Generates realistic account records based on the account.yaml schema
 * with proper validation constraints and edge cases.
 */

import { BaseGenerator } from './base-generator.js';
import { GeneratedRecord, DataGeneratorOptions, GeneratorContext } from '@src/lib/fixtures/types.js';

export class AccountGenerator extends BaseGenerator {
  
  private readonly firstNames = [
    'John', 'Jane', 'Michael', 'Sarah', 'David', 'Lisa', 'Robert', 'Emily',
    'William', 'Emma', 'James', 'Olivia', 'Benjamin', 'Ava', 'Alexander', 'Isabella',
    'Daniel', 'Sophia', 'Matthew', 'Charlotte', 'Christopher', 'Mia', 'Joshua', 'Amelia'
  ];
  
  private readonly lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
    'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White'
  ];
  
  private readonly domains = [
    'example.com', 'test.com', 'demo.org', 'sample.net', 'placeholder.co',
    'gmail.com', 'yahoo.com', 'hotmail.com', 'company.com', 'business.org'
  ];
  
  private readonly accountTypes = ['personal', 'business', 'trial', 'premium'];
  
  generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[] {
    const accounts: GeneratedRecord[] = [];
    
    for (let i = 0; i < count; i++) {
      const firstName = this.getRandomItem(this.firstNames);
      const lastName = this.getRandomItem(this.lastNames);
      const domain = options.realistic_names ? this.getRandomItem(this.domains) : 'example.com';
      
      // Generate deterministic data for reproducible tests
      const accountId = this.generateDeterministicUuid('account', `account-${i}`);
      const username = this.generateUsername(firstName, lastName, i);
      const email = this.generateRealisticEmail(firstName, lastName, domain);
      const createdAt = this.generateCreatedDate(i);
      
      const account: GeneratedRecord = {
        // Required fields
        id: accountId,
        name: `${firstName} ${lastName}`,
        email: email,
        username: username,
        account_type: this.generateAccountType(i),
        
        // Optional fields with defaults
        balance: this.generateBalance(i),
        is_active: this.generateActiveStatus(i),
        is_verified: this.generateVerifiedStatus(i),
        
        // Nullable fields
        credit_limit: this.generateCreditLimit(i),
        last_login: this.generateLastLogin(createdAt, i),
        phone: this.generatePhone(i),
        
        // Complex objects
        preferences: this.generatePreferences(i),
        metadata: this.generateMetadata(i)
      };
      
      accounts.push(account);
    }
    
    // Add edge cases if requested
    if (options.include_edge_cases) {
      accounts.push(...this.generateEdgeCases());
    }
    
    return accounts;
  }
  
  /**
   * Generate username following pattern: ^[a-zA-Z0-9_-]{3,50}$
   */
  private generateUsername(firstName: string, lastName: string, index: number): string {
    const baseFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const baseLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
    
    // Create variations to ensure uniqueness
    if (index === 0) {
      return `${baseFirst}_${baseLast}`;
    } else if (index < 10) {
      return `${baseFirst}_${baseLast}${index}`;
    } else if (index < 100) {
      return `${baseFirst}-${baseLast}-${index}`;
    } else {
      // For larger indexes, use more compact format
      return `user_${baseFirst}${index}`;
    }
  }
  
  /**
   * Generate account type with realistic distribution
   */
  private generateAccountType(index: number): string {
    if (index % 10 === 0) return 'business';    // 10% business
    if (index % 20 === 1) return 'premium';     // 5% premium
    if (index % 15 === 2) return 'trial';       // ~7% trial
    return 'personal';                          // ~78% personal
  }
  
  /**
   * Generate balance (0 to 1,000,000 per schema)
   */
  private generateBalance(index: number): number {
    const seed = this.seededRandom(`balance-${index}`);
    
    if (seed > 0.95) {
      // 5% have very high balances ($100,000-$1,000,000)
      return Math.round((100000 + seed * 900000) * 100) / 100;
    } else if (seed > 0.9) {
      // 5% have high balances ($10,000-$100,000)
      return Math.round((10000 + seed * 90000) * 100) / 100;
    } else if (seed > 0.7) {
      // 20% have medium balances ($1,000-$10,000)
      return Math.round((1000 + seed * 9000) * 100) / 100;
    } else if (seed > 0.3) {
      // 40% have low balances ($100-$1,000)
      return Math.round((100 + seed * 900) * 100) / 100;
    } else {
      // 30% have minimal balances ($0-$100)
      return Math.round((seed * 100) * 100) / 100;
    }
  }
  
  /**
   * Generate active status (90% active)
   */
  private generateActiveStatus(index: number): boolean {
    return index % 10 !== 0; // 90% active, 10% inactive
  }
  
  /**
   * Generate verified status (80% verified)
   */
  private generateVerifiedStatus(index: number): boolean {
    return index % 5 !== 0; // 80% verified, 20% unverified
  }
  
  /**
   * Generate credit limit for business/premium accounts (nullable)
   */
  private generateCreditLimit(index: number): number | null {
    const accountType = this.generateAccountType(index);
    
    if (accountType === 'business' || accountType === 'premium') {
      const seed = this.seededRandom(`credit-${index}`);
      // Business/premium accounts get $500-$10,000 credit limits
      return Math.round((500 + seed * 9500) * 100) / 100;
    }
    
    // Personal and trial accounts don't get credit limits
    return null;
  }
  
  /**
   * Generate last login date (nullable)
   */
  private generateLastLogin(createdAt: string, index: number): string | null {
    // 20% never logged in
    if (index % 5 === 0) {
      return null;
    }
    
    // Last login within the last 6 months from now
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const lastLogin = this.generateDateInRange(sixMonthsAgo, now);
    
    return lastLogin.toISOString();
  }
  
  /**
   * Generate phone number (nullable, matching pattern)
   */
  private generatePhone(index: number): string | null {
    // 60% have phone numbers
    if (index % 10 < 4) {
      return null;
    }
    
    // Generate US format phone numbers
    const areaCode = ['555', '415', '212', '310', '617'][index % 5];
    const exchange = String(200 + (index % 800)).padStart(3, '0');
    const number = String(1000 + (index % 9000)).padStart(4, '0');
    
    // Alternate between formats
    if (index % 2 === 0) {
      return `+1 (${areaCode}) ${exchange}-${number}`;
    } else {
      return `+1${areaCode}${exchange}${number}`;
    }
  }
  
  /**
   * Generate preferences object
   */
  private generatePreferences(index: number): object {
    return {
      notifications: index % 3 !== 0,           // 67% enable notifications
      theme: index % 4 === 0 ? 'dark' : 'light', // 25% dark theme
      language: index % 10 === 0 ? 'es' : 'en'   // 10% Spanish, 90% English
    };
  }
  
  /**
   * Generate metadata object (flexible additional data)
   */
  private generateMetadata(index: number): object {
    const metadata: any = {
      source: index % 7 === 0 ? 'referral' : 'signup',
      ip_country: 'US',
      created_at: this.generateCreatedDate(index)
    };
    
    // Add optional metadata for some accounts
    if (index % 6 === 0) {
      metadata.marketing_consent = true;
      metadata.newsletter_subscribed = true;
    }
    
    if (index % 8 === 0) {
      metadata.beta_tester = true;
      metadata.early_adopter = true;
    }
    
    if (index % 12 === 0) {
      metadata.referral_code = `REF${1000 + index}`;
      metadata.referred_by = 'user-123';
    }
    
    return metadata;
  }
  
  /**
   * Generate creation date
   */
  private generateCreatedDate(index: number): string {
    // Accounts created over the last 2 years
    const now = new Date();
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
    const createdDate = this.generateDateInRange(twoYearsAgo, now);
    
    return createdDate.toISOString();
  }
  
  /**
   * Generate edge case records for testing boundary conditions
   */
  private generateEdgeCases(): GeneratedRecord[] {
    return [
      {
        // Minimal data - only required fields
        id: this.generateDeterministicUuid('account', 'edge-minimal'),
        name: 'Mi',  // Minimum 2 characters
        email: 'a@b.co',  // Valid minimal email
        username: 'min',  // Minimum 3 characters
        account_type: 'personal',
        balance: 0,
        is_active: false,
        is_verified: false,
        credit_limit: null,
        last_login: null,
        phone: null,
        preferences: {
          notifications: false,
          theme: 'light',
          language: 'en'
        },
        metadata: {}
      },
      {
        // Maximum values
        id: this.generateDeterministicUuid('account', 'edge-maximum'),
        name: 'A'.repeat(100), // Maximum 100 characters
        email: `${'x'.repeat(240)}@example.com`, // Max 255 chars but valid format
        username: 'a'.repeat(50), // Maximum 50 characters
        account_type: 'premium',
        balance: 1000000.00, // Maximum balance
        is_active: true,
        is_verified: true,
        credit_limit: 10000.00, // Maximum credit limit
        last_login: new Date().toISOString(),
        phone: '+12345678901234', // 14 digits max international
        preferences: {
          notifications: true,
          theme: 'dark',
          language: 'es'
        },
        metadata: {
          source: 'premium_upgrade',
          ip_country: 'US',
          beta_tester: true,
          marketing_consent: true,
          custom_field_1: 'value1',
          custom_field_2: 'value2',
          nested: {
            level1: {
              level2: 'deep'
            }
          }
        }
      },
      {
        // Special characters in text fields
        id: this.generateDeterministicUuid('account', 'edge-special-chars'),
        name: "O'Reilly-Smith, Jr.",
        email: 'test.user+special@example.com',
        username: 'user_with-dashes',
        account_type: 'business',
        balance: 12345.67,
        is_active: true,
        is_verified: true,
        credit_limit: 5000.00,
        last_login: new Date().toISOString(),
        phone: '+1 (555) 123-4567',
        preferences: {
          notifications: true,
          theme: 'light',
          language: 'en'
        },
        metadata: {
          source: 'referral',
          ip_country: 'CA',
          notes: "Special chars: & < > \" ' / \\ | @ # $ % ^ * ( ) { } [ ]",
          unicode: '日本語 français español Deutsch',
          emoji: '🎉 🚀 ✨'
        }
      },
      {
        // Null/empty optional fields
        id: this.generateDeterministicUuid('account', 'edge-null-values'),
        name: 'Null Test User',
        email: 'null.test@example.com',
        username: 'null_tester',
        account_type: 'trial',
        balance: 0.01, // Minimal non-zero balance
        is_active: true,
        is_verified: false,
        credit_limit: null,
        last_login: null,
        phone: null,
        preferences: {
          notifications: true,
          theme: 'light',
          language: 'en'
        },
        metadata: {
          // Minimal metadata
          source: 'test'
        }
      },
      {
        // Business account with all features
        id: this.generateDeterministicUuid('account', 'edge-business-full'),
        name: 'Enterprise Business Account',
        email: 'enterprise@business.com',
        username: 'enterprise_account',
        account_type: 'business',
        balance: 999999.99, // Just under max
        is_active: true,
        is_verified: true,
        credit_limit: 9999.99, // Just under max
        last_login: new Date().toISOString(),
        phone: '+14155551234',
        preferences: {
          notifications: true,
          theme: 'dark',
          language: 'en'
        },
        metadata: {
          source: 'enterprise_sales',
          ip_country: 'US',
          company_name: 'Big Corp Inc.',
          tax_id: 'TAX123456',
          contract_id: 'CONTRACT-2024-001',
          account_manager: 'John Doe',
          sla_level: 'platinum',
          custom_integration: true
        }
      }
    ];
  }
  
  /**
   * No dependencies for account generation
   */
  getDependencies(): string[] {
    return [];
  }
}