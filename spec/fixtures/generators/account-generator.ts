/**
 * Account Generator
 * 
 * Generates realistic account/user records with proper relationships
 * and edge cases for comprehensive testing.
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
      
      const account: GeneratedRecord = {
        id: accountId,
        name: `${firstName} ${lastName}`,
        email: email,
        username: username,
        account_type: this.getAccountType(i),
        balance: this.generateBalance(i),
        is_active: this.generateActiveStatus(i),
        is_verified: this.generateVerifiedStatus(i),
        created_at: this.generateCreatedDate(i),
        phone: options.realistic_names ? this.generatePhoneNumber() : null
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
   * Generate username with variations to avoid conflicts
   */
  private generateUsername(firstName: string, lastName: string, index: number): string {
    const base = `${firstName.toLowerCase()}${lastName.toLowerCase()}`;
    
    if (index === 0) {
      return base;
    } else if (index < 10) {
      return `${base}${index}`;
    } else {
      // Add random suffix for higher indexes
      const suffix = Math.floor(index / 10) * 10 + (index % 10);
      return `${base}${suffix}`;
    }
  }
  
  /**
   * Generate account type with realistic distribution
   */
  private getAccountType(index: number): string {
    if (index % 10 === 0) return 'business';    // 10% business
    if (index % 20 === 1) return 'premium';     // 5% premium
    if (index % 15 === 2) return 'trial';       // ~7% trial
    return 'personal';                          // ~78% personal
  }
  
  /**
   * Generate realistic balance with distribution
   */
  private generateBalance(index: number): number {
    // Most accounts have low balances, some have higher amounts
    const seed = this.seededRandom(`balance-${index}`);
    
    if (seed > 0.9) {
      // 10% have high balances ($1000-$10000)
      return Math.round((1000 + seed * 9000) * 100) / 100;
    } else if (seed > 0.7) {
      // 20% have medium balances ($100-$1000)
      return Math.round((100 + seed * 900) * 100) / 100;
    } else {
      // 70% have low balances ($0-$100)
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
   * Generate realistic creation dates
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
        id: this.generateDeterministicUuid('account', 'edge-null-values'),
        name: 'Edge Case Null',
        email: 'edge.null@example.com',
        username: 'edgenull',
        account_type: 'trial',
        balance: 0.00,
        is_active: false,
        is_verified: false,
        created_at: new Date().toISOString(),
        phone: null
      },
      {
        id: this.generateDeterministicUuid('account', 'edge-max-values'),
        name: 'Edge Case Maximum Values Test User',
        email: 'very.long.email.address.for.testing@very-long-domain-name-example.com',
        username: 'verylongusernamefortesting123456',
        account_type: 'premium',
        balance: 999999.99,
        is_active: true,
        is_verified: true,
        created_at: new Date('2020-01-01').toISOString(),
        phone: '(999) 999-9999'
      },
      {
        id: this.generateDeterministicUuid('account', 'edge-special-chars'),
        name: 'Test O\'Reilly-Smith',
        email: 'test.special+chars@example.com',
        username: 'testspecial',
        account_type: 'personal',
        balance: 123.45,
        is_active: true,
        is_verified: true,
        created_at: new Date().toISOString(),
        phone: '(123) 456-7890'
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