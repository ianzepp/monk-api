/**
 * Contact Generator
 * 
 * Generates realistic contact records with relationships to accounts
 * and proper edge cases for comprehensive testing.
 */

import { BaseGenerator } from './base-generator.js';
import { GeneratedRecord, DataGeneratorOptions, GeneratorContext } from '@src/lib/fixtures/types.js';

export class ContactGenerator extends BaseGenerator {
  
  private readonly firstNames = [
    'Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Avery',
    'Quinn', 'Blake', 'Cameron', 'Drew', 'Hayden', 'Jamie', 'Kendall', 'Leslie',
    'Parker', 'Reese', 'Sage', 'Skyler', 'Sydney', 'Tracy', 'Winter', 'Phoenix'
  ];
  
  private readonly lastNames = [
    'Johnson', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor',
    'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia',
    'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall'
  ];
  
  private readonly companies = [
    'Tech Solutions Inc', 'Global Dynamics', 'Innovative Systems', 'Digital Ventures',
    'Smart Technologies', 'Future Labs', 'Creative Studios', 'Advanced Analytics',
    'Quantum Computing', 'Cloud Services', 'Data Insights', 'Mobile Apps LLC',
    'Web Development Co', 'AI Research', 'Blockchain Solutions', 'Cyber Security'
  ];
  
  private readonly contactTypes = ['customer', 'vendor', 'partner', 'employee', 'lead', 'prospect'];
  private readonly statuses = ['active', 'inactive', 'pending', 'qualified'];
  private readonly priorities = ['low', 'normal', 'high', 'urgent'];
  private readonly sources = ['website', 'referral', 'advertising', 'trade_show', 'cold_call', 'other'];
  private readonly jobTitles = [
    'Software Engineer', 'Product Manager', 'Sales Director', 'Marketing Manager',
    'CEO', 'CTO', 'VP Sales', 'Account Executive', 'Developer', 'Designer',
    'Operations Manager', 'Customer Success', 'Business Analyst', 'Consultant'
  ];
  
  generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[] {
    const contacts: GeneratedRecord[] = [];
    
    for (let i = 0; i < count; i++) {
      const firstName = this.getRandomItem(this.firstNames);
      const lastName = this.getRandomItem(this.lastNames);
      
      // Generate deterministic data for reproducible tests
      const contactId = this.generateDeterministicUuid('contact', `contact-${i}`);
      const email = this.generateRealisticEmail(firstName, lastName);
      
      const contact: GeneratedRecord = {
        id: contactId,
        first_name: firstName,
        last_name: lastName,
        company: this.getCompany(i, options),
        job_title: this.getJobTitle(i, options),
        email: email,
        phone: this.generatePhoneNumber(),
        mobile: this.generateMobileNumber(i),
        address: this.generateAddress(i, options),
        contact_type: this.getContactType(i),
        status: this.getStatus(i),
        priority: this.getPriority(i),
        source: this.getSource(i),
        account_id: this.getAccountId(context, i, options),
        notes: this.generateNotes(firstName, lastName, i, options),
        is_active: this.generateActiveStatus(i),
        last_contacted: this.generateLastContactedDate(i),
        tags: this.generateTags(i, options)
        // Note: created_at and updated_at are added automatically by the system
      };
      
      contacts.push(contact);
    }
    
    // Add edge cases if requested
    if (options.include_edge_cases) {
      contacts.push(...this.generateEdgeCases(context, options));
    }
    
    return contacts;
  }
  
  /**
   * Generate company name with realistic distribution
   */
  private getCompany(index: number, options: DataGeneratorOptions): string | null {
    // 30% of contacts don't have a company
    if (index % 10 < 3) {
      return null;
    }
    
    if (options.realistic_names) {
      return this.getRandomItem(this.companies);
    }
    
    return `Company ${Math.floor(index / 3) + 1}`;
  }
  
  /**
   * Generate job title with realistic distribution
   */
  private getJobTitle(index: number, options: DataGeneratorOptions): string | null {
    // 20% of contacts don't have a job title
    if (index % 5 === 0) {
      return null;
    }
    
    if (options.realistic_names) {
      return this.getRandomItem(this.jobTitles);
    }
    
    return `Job Title ${Math.floor(index / 5) + 1}`;
  }
  
  /**
   * Generate mobile number (different from phone)
   */
  private generateMobileNumber(index: number): string | null {
    // 60% of contacts have mobile numbers
    if (index % 5 > 2) {
      return null;
    }
    
    return this.generatePhoneNumber('555'); // Use 555 area code for mobile
  }
  
  /**
   * Generate address object
   */
  private generateAddress(index: number, options: DataGeneratorOptions): object | null {
    // 40% of contacts have addresses
    if (index % 5 > 1) {
      return null;
    }
    
    if (options.realistic_names) {
      const streets = ['123 Main St', '456 Oak Ave', '789 Pine Dr', '321 Elm St', '654 Cedar Ln'];
      const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
      const states = ['NY', 'CA', 'IL', 'TX', 'AZ'];
      
      return {
        street: this.getRandomItem(streets),
        city: this.getRandomItem(cities),
        state: this.getRandomItem(states),
        postal_code: String(Math.floor(Math.random() * 90000) + 10000),
        country: 'US'
      };
    }
    
    return {
      street: `${100 + index} Test St`,
      city: 'Test City',
      state: 'TS',
      postal_code: `${10000 + index}`,
      country: 'US'
    };
  }
  
  /**
   * Generate contact type with realistic distribution
   */
  private getContactType(index: number): string {
    if (index % 2 === 0) return 'customer';      // 50% customers
    if (index % 4 === 1) return 'prospect';      // 25% prospects
    if (index % 8 === 3) return 'partner';       // 12.5% partners
    if (index % 16 === 7) return 'employee';     // 6.25% employees
    if (index % 32 === 15) return 'lead';        // 3.125% leads
    return 'vendor';                             // Remaining vendors
  }
  
  /**
   * Generate priority with realistic distribution
   */
  private getPriority(index: number): string {
    if (index % 10 === 0) return 'urgent';       // 10% urgent
    if (index % 5 === 1) return 'high';         // 20% high
    if (index % 8 === 2) return 'low';          // 12.5% low
    return 'normal';                             // 57.5% normal
  }
  
  /**
   * Generate source with realistic distribution
   */
  private getSource(index: number): string {
    if (index % 3 === 0) return 'website';       // 33% website
    if (index % 5 === 1) return 'referral';      // 20% referral
    if (index % 7 === 2) return 'advertising';   // ~14% advertising
    if (index % 11 === 3) return 'trade_show';   // ~9% trade show
    if (index % 13 === 4) return 'cold_call';    // ~8% cold call
    return 'other';                              // Remaining other
  }
  
  /**
   * Generate active status (85% active)
   */
  private generateActiveStatus(index: number): boolean {
    return index % 7 !== 0; // 85% active, 15% inactive
  }
  
  /**
   * Generate tags array
   */
  private generateTags(index: number, options: DataGeneratorOptions): string[] {
    // 30% of contacts have tags
    if (index % 10 > 2) {
      return [];
    }
    
    const availableTags = ['vip', 'technical', 'decision-maker', 'budget-holder', 'influencer', 'champion'];
    const tagCount = Math.floor(Math.random() * 3) + 1; // 1-3 tags
    
    return this.getRandomItems(availableTags, tagCount);
  }
  
  /**
   * Generate status with realistic distribution
   */
  private getStatus(index: number): string {
    if (index % 5 === 0) return 'inactive';      // 20% inactive
    if (index % 7 === 1) return 'pending';       // ~14% pending
    if (index % 6 === 2) return 'qualified';     // ~17% qualified
    return 'active';                             // ~49% active
  }
  
  /**
   * Generate realistic notes
   */
  private generateNotes(firstName: string, lastName: string, index: number, options: DataGeneratorOptions): string | null {
    // 40% of contacts have notes
    if (index % 5 > 1) {
      return null;
    }
    
    const noteTemplates = [
      `Initial contact with ${firstName} regarding potential partnership.`,
      `Follow up needed with ${lastName} on project requirements.`,
      `Discussed pricing options during last call.`,
      `Interested in enterprise features. Schedule demo.`,
      `Previous customer, good relationship established.`
    ];
    
    if (options.realistic_names) {
      return this.getRandomItem(noteTemplates);
    }
    
    return `Notes for contact ${index}`;
  }
  
  /**
   * Generate creation date (contacts are newer than accounts)
   */
  private generateCreatedDate(index: number): string {
    // Contacts created over the last year
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const createdDate = this.generateDateInRange(oneYearAgo, now);
    
    return createdDate.toISOString();
  }
  
  /**
   * Generate last contacted date (realistic interaction timeline)
   */
  private generateLastContactedDate(index: number): string | null {
    // 60% of contacts have been contacted recently
    if (index % 5 > 2) {
      return null;
    }
    
    // Last contacted within the last 3 months
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const lastContacted = this.generateDateInRange(threeMonthsAgo, now);
    
    return lastContacted.toISOString();
  }
  
  /**
   * Generate account relationship if accounts exist
   */
  private getAccountId(context: GeneratorContext | undefined, index: number, options: DataGeneratorOptions): string | null {
    if (!options.link_to_accounts || !context) {
      return null;
    }
    
    // 70% of contacts are linked to accounts
    if (index % 10 > 6) {
      return null;
    }
    
    return this.generateForeignKey(context, 'account', 'id');
  }
  
  /**
   * Generate edge case records
   */
  private generateEdgeCases(context: GeneratorContext | undefined, options: DataGeneratorOptions): GeneratedRecord[] {
    const edgeCases = [
      {
        id: this.generateDeterministicUuid('contact', 'edge-minimal'),
        first_name: 'Min',
        last_name: 'Data',
        company: null,
        job_title: null,
        email: 'min@example.com',
        phone: null,
        mobile: null,
        address: null,
        contact_type: 'customer',
        status: 'active',
        priority: 'normal',
        source: 'other',
        account_id: null,
        notes: null,
        is_active: true,
        last_contacted: null,
        tags: []
      },
      {
        id: this.generateDeterministicUuid('contact', 'edge-maximum'),
        first_name: 'Maximum',
        last_name: 'Data-Testing-Very-Long-Name',
        company: 'Very Long Company Name for Testing Maximum Length Fields Inc.',
        job_title: 'Senior Vice President of Business Development and Strategic Partnerships',
        email: 'maximum.data.testing.very.long.name@very-long-domain-example.com',
        phone: '+1 (999) 888-7777',
        mobile: '+1 (999) 777-8888',
        address: {
          street: '12345 Very Long Street Name for Testing Maximum Length',
          city: 'Very Long City Name',
          state: 'California',
          postal_code: '99999-9999',
          country: 'United States'
        },
        contact_type: 'partner',
        status: 'qualified',
        priority: 'urgent',
        source: 'trade_show',
        account_id: options.link_to_accounts && context 
          ? this.generateForeignKey(context, 'account', 'id') 
          : null,
        notes: 'This is a very long note field designed to test the maximum length handling of the notes field in the database. It contains multiple sentences and should help validate proper text handling.',
        is_active: true,
        last_contacted: new Date().toISOString(),
        tags: ['vip', 'technical', 'decision-maker']
      },
      {
        id: this.generateDeterministicUuid('contact', 'edge-special-chars'),
        first_name: 'José',
        last_name: 'O\'Reilly-Smith',
        company: 'Café & Restaurant Solutions',
        job_title: 'Maître d\'Hôtel',
        email: 'jose.oreilly+test@example.com',
        phone: '+1 (555) 123-4567',
        mobile: '+1 (555) 765-4321',
        address: {
          street: '123 Café Street',
          city: 'San José',
          state: 'CA',
          postal_code: '95110',
          country: 'US'
        },
        contact_type: 'customer',
        status: 'active',
        priority: 'high',
        source: 'referral',
        account_id: options.link_to_accounts && context 
          ? this.generateForeignKey(context, 'account', 'id') 
          : null,
        notes: 'Special characters: àáâãäåæçèéêë',
        is_active: true,
        last_contacted: new Date().toISOString(),
        tags: ['international', 'special-chars']
      }
    ];
    
    return edgeCases;
  }
  
  /**
   * Contacts depend on accounts if linking is enabled
   */
  getDependencies(): string[] {
    return ['account']; // Generate accounts first to establish relationships
  }
}