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
  
  private readonly contactTypes = ['customer', 'prospect', 'partner', 'vendor'];
  private readonly statuses = ['active', 'inactive', 'pending', 'qualified'];
  
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
        email: email,
        phone: this.generatePhoneNumber(),
        company: this.getCompany(i, options),
        contact_type: this.getContactType(i),
        status: this.getStatus(i),
        notes: this.generateNotes(firstName, lastName, i, options),
        created_at: this.generateCreatedDate(i),
        last_contacted: this.generateLastContactedDate(i),
        account_id: this.getAccountId(context, i, options)
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
   * Generate contact type with realistic distribution
   */
  private getContactType(index: number): string {
    if (index % 2 === 0) return 'customer';      // 50% customers
    if (index % 4 === 1) return 'prospect';      // 25% prospects
    if (index % 8 === 3) return 'partner';       // 12.5% partners
    return 'vendor';                             // 12.5% vendors
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
        email: 'min@example.com',
        phone: null,
        company: null,
        contact_type: 'customer',
        status: 'active',
        notes: null,
        created_at: new Date().toISOString(),
        last_contacted: null,
        account_id: null
      },
      {
        id: this.generateDeterministicUuid('contact', 'edge-maximum'),
        first_name: 'Maximum',
        last_name: 'Data-Testing-Very-Long-Name',
        email: 'maximum.data.testing.very.long.name@very-long-domain-example.com',
        phone: '(999) 888-7777 ext 12345',
        company: 'Very Long Company Name for Testing Maximum Length Fields Inc.',
        contact_type: 'partner',
        status: 'qualified',
        notes: 'This is a very long note field designed to test the maximum length handling of the notes field in the database. It contains multiple sentences and should help validate proper text handling.',
        created_at: new Date('2020-01-01').toISOString(),
        last_contacted: new Date().toISOString(),
        account_id: options.link_to_accounts && context 
          ? this.generateForeignKey(context, 'account', 'id') 
          : null
      },
      {
        id: this.generateDeterministicUuid('contact', 'edge-special-chars'),
        first_name: 'José',
        last_name: 'O\'Reilly-Smith',
        email: 'jose.oreilly+test@example.com',
        phone: '(555) 123-4567',
        company: 'Café & Restaurant Solutions',
        contact_type: 'customer',
        status: 'active',
        notes: 'Special characters: àáâãäåæçèéêë',
        created_at: new Date().toISOString(),
        last_contacted: new Date().toISOString(),
        account_id: options.link_to_accounts && context 
          ? this.generateForeignKey(context, 'account', 'id') 
          : null
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