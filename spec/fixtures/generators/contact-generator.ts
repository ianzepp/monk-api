/**
 * Contact Generator
 * 
 * Generates realistic contact records based on the contact.yaml schema
 * with proper relationships and edge cases for comprehensive testing.
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
  
  private readonly jobTitles = [
    'Software Engineer', 'Product Manager', 'Sales Director', 'Marketing Manager',
    'CEO', 'CTO', 'VP Sales', 'Account Executive', 'Developer', 'Designer',
    'Operations Manager', 'Customer Success', 'Business Analyst', 'Consultant'
  ];
  
  private readonly contactTypes = ['customer', 'vendor', 'partner', 'employee', 'lead', 'prospect'];
  private readonly statuses = ['active', 'inactive', 'pending', 'qualified'];
  private readonly priorities = ['low', 'normal', 'high', 'urgent'];
  private readonly sources = ['website', 'referral', 'advertising', 'trade_show', 'cold_call', 'other'];
  private readonly tags = [
    'vip', 'technical', 'decision-maker', 'budget-holder', 'influencer', 
    'champion', 'blocker', 'early-adopter', 'key-contact', 'stakeholder'
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
        // Required fields
        id: contactId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        contact_type: this.generateContactType(i),
        
        // Optional fields with defaults
        status: this.generateStatus(i),
        priority: this.generatePriority(i),
        is_active: this.generateActiveStatus(i),
        
        // Nullable fields
        company: this.generateCompany(i, options),
        job_title: this.generateJobTitle(i, options),
        phone: this.generatePhone(i),
        mobile: this.generateMobile(i),
        address: this.generateAddress(i, options),
        source: this.generateSource(i),
        account_id: this.generateAccountId(context, i, options),
        notes: this.generateNotes(firstName, lastName, i, options),
        last_contacted: this.generateLastContactedDate(i),
        tags: this.generateTags(i)
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
   * Generate contact type with realistic distribution
   */
  private generateContactType(index: number): string {
    if (index % 2 === 0) return 'customer';      // 50% customers
    if (index % 4 === 1) return 'prospect';      // 25% prospects
    if (index % 8 === 3) return 'partner';       // 12.5% partners
    if (index % 16 === 7) return 'employee';     // 6.25% employees
    if (index % 32 === 15) return 'lead';        // 3.125% leads
    return 'vendor';                             // Remaining vendors
  }
  
  /**
   * Generate status with realistic distribution
   */
  private generateStatus(index: number): string {
    if (index % 5 === 0) return 'inactive';      // 20% inactive
    if (index % 7 === 1) return 'pending';       // ~14% pending
    if (index % 6 === 2) return 'qualified';     // ~17% qualified
    return 'active';                             // ~49% active
  }
  
  /**
   * Generate priority with realistic distribution
   */
  private generatePriority(index: number): string {
    if (index % 10 === 0) return 'urgent';       // 10% urgent
    if (index % 5 === 1) return 'high';          // 20% high
    if (index % 8 === 2) return 'low';           // 12.5% low
    return 'normal';                             // 57.5% normal
  }
  
  /**
   * Generate active status (85% active)
   */
  private generateActiveStatus(index: number): boolean {
    return index % 7 !== 0; // ~85% active, ~15% inactive
  }
  
  /**
   * Generate company name (nullable, max 100 chars)
   */
  private generateCompany(index: number, options: DataGeneratorOptions): string | null {
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
   * Generate job title (nullable, max 100 chars)
   */
  private generateJobTitle(index: number, options: DataGeneratorOptions): string | null {
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
   * Generate phone number (nullable, pattern: ^[+]?[0-9\s\-\(\)]{10,20}$)
   */
  private generatePhone(index: number): string | null {
    // 40% don't have phone
    if (index % 5 < 2) {
      return null;
    }
    
    const areaCode = ['212', '415', '718', '310', '312'][index % 5];
    const exchange = String(200 + (index % 800)).padStart(3, '0');
    const number = String(1000 + (index % 9000)).padStart(4, '0');
    
    // Alternate formats for variety
    if (index % 3 === 0) {
      return `+1 (${areaCode}) ${exchange}-${number}`;
    } else if (index % 3 === 1) {
      return `(${areaCode}) ${exchange}-${number}`;
    } else {
      return `${areaCode}-${exchange}-${number}`;
    }
  }
  
  /**
   * Generate mobile number (nullable, different from phone)
   */
  private generateMobile(index: number): string | null {
    // 60% have mobile numbers
    if (index % 5 > 2) {
      return null;
    }
    
    const areaCode = '555'; // Use 555 for mobile
    const exchange = String(300 + (index % 700)).padStart(3, '0');
    const number = String(2000 + (index % 8000)).padStart(4, '0');
    
    return `+1 (${areaCode}) ${exchange}-${number}`;
  }
  
  /**
   * Generate address object (nullable)
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
   * Generate source with realistic distribution
   */
  private generateSource(index: number): string | null {
    // 10% have no source
    if (index % 10 === 9) {
      return null;
    }
    
    if (index % 3 === 0) return 'website';       // 30% website
    if (index % 5 === 1) return 'referral';      // 20% referral
    if (index % 7 === 2) return 'advertising';   // ~14% advertising
    if (index % 11 === 3) return 'trade_show';   // ~9% trade show
    if (index % 13 === 4) return 'cold_call';    // ~8% cold call
    return 'other';                              // Remaining other
  }
  
  /**
   * Generate account relationship (nullable, UUID)
   */
  private generateAccountId(context: GeneratorContext | undefined, index: number, options: DataGeneratorOptions): string | null {
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
   * Generate notes (nullable, max 1000 chars)
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
      `Previous customer, good relationship established.`,
      `Met at trade show, very interested in our solutions.`,
      `Referred by existing customer. High potential.`,
      `Needs custom integration. Technical discussion required.`
    ];
    
    if (options.realistic_names) {
      return this.getRandomItem(noteTemplates);
    }
    
    return `Notes for contact ${index}: Standard test note content.`;
  }
  
  /**
   * Generate last contacted date (nullable)
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
   * Generate tags array (max 10 items, each max 50 chars)
   */
  private generateTags(index: number): string[] {
    // 30% have no tags
    if (index % 10 < 3) {
      return [];
    }
    
    // 40% have 1-2 tags
    if (index % 10 < 7) {
      const tagCount = 1 + (index % 2);
      return this.getRandomItems(this.tags, tagCount);
    }
    
    // 30% have 3-5 tags
    const tagCount = 3 + (index % 3);
    return this.getRandomItems(this.tags, Math.min(tagCount, 10));
  }
  
  /**
   * Generate edge case records for testing boundary conditions
   */
  private generateEdgeCases(context: GeneratorContext | undefined, options: DataGeneratorOptions): GeneratedRecord[] {
    const edgeCases: GeneratedRecord[] = [
      {
        // Minimal data - only required fields
        id: this.generateDeterministicUuid('contact', 'edge-minimal'),
        first_name: 'A', // Minimum 1 character
        last_name: 'B',  // Minimum 1 character
        email: 'a@b.c',
        contact_type: 'customer',
        status: 'active',
        priority: 'normal',
        is_active: true,
        company: null,
        job_title: null,
        phone: null,
        mobile: null,
        address: null,
        source: null,
        account_id: null,
        notes: null,
        last_contacted: null,
        tags: []
      },
      {
        // Maximum values
        id: this.generateDeterministicUuid('contact', 'edge-maximum'),
        first_name: 'A'.repeat(50), // Maximum 50 characters
        last_name: 'B'.repeat(50),  // Maximum 50 characters
        email: `${'x'.repeat(240)}@example.com`, // Max 255 chars but valid format
        contact_type: 'partner',
        status: 'qualified',
        priority: 'urgent',
        is_active: true,
        company: 'C'.repeat(100), // Maximum 100 characters
        job_title: 'D'.repeat(100), // Maximum 100 characters
        phone: '+12345678901234567890', // Maximum 20 chars
        mobile: '+19876543210987654321', // Maximum 20 chars
        address: {
          street: 'S'.repeat(200), // Maximum 200 characters
          city: 'C'.repeat(100),   // Maximum 100 characters
          state: 'S'.repeat(50),   // Maximum 50 characters
          postal_code: 'P'.repeat(20), // Maximum 20 characters
          country: 'C'.repeat(50)  // Maximum 50 characters
        },
        source: 'trade_show',
        account_id: options.link_to_accounts && context 
          ? this.generateForeignKey(context, 'account', 'id') 
          : this.generateDeterministicUuid('account', 'test-account'),
        notes: 'N'.repeat(1000), // Maximum 1000 characters
        last_contacted: new Date().toISOString(),
        tags: Array(10).fill('tag').map((t, i) => `${t}${i}`.substring(0, 50)) // 10 tags max
      },
      {
        // Special characters and Unicode
        id: this.generateDeterministicUuid('contact', 'edge-special-chars'),
        first_name: 'José',
        last_name: "O'Reilly-Smith",
        email: 'jose.oreilly+test@example.com',
        contact_type: 'customer',
        status: 'active',
        priority: 'high',
        is_active: true,
        company: 'Café & Co. "Special" Solutions',
        job_title: "Maître d'Hôtel / Manager",
        phone: '+1 (555) 123-4567',
        mobile: '+1 (555) 987-6543',
        address: {
          street: '123 Café Street #456',
          city: 'San José',
          state: 'CA',
          postal_code: '95110-1234',
          country: 'United States'
        },
        source: 'referral',
        account_id: options.link_to_accounts && context 
          ? this.generateForeignKey(context, 'account', 'id') 
          : null,
        notes: 'Special chars test: àáâãäå çèéêë ìíîï ñòóôõö ùúûü ýÿ & < > " \' @#$%^*()',
        last_contacted: new Date().toISOString(),
        tags: ['español', 'français', '日本語', 'special-chars']
      },
      {
        // Business contact with full data
        id: this.generateDeterministicUuid('contact', 'edge-business-full'),
        first_name: 'Enterprise',
        last_name: 'Contact',
        email: 'enterprise.contact@bigcorp.com',
        contact_type: 'partner',
        status: 'qualified',
        priority: 'urgent',
        is_active: true,
        company: 'Big Corporation International LLC',
        job_title: 'Senior Vice President of Strategic Partnerships',
        phone: '+1 (212) 555-0100',
        mobile: '+1 (917) 555-0200',
        address: {
          street: '1 Corporate Plaza, Suite 1000',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country: 'US'
        },
        source: 'trade_show',
        account_id: options.link_to_accounts && context 
          ? this.generateForeignKey(context, 'account', 'id') 
          : this.generateDeterministicUuid('account', 'enterprise-account'),
        notes: 'Key strategic partner. Multiple ongoing projects. Executive sponsor: CEO. Annual contract value: $1M+. Renewal date: Q4.',
        last_contacted: new Date().toISOString(),
        tags: ['vip', 'decision-maker', 'budget-holder', 'champion', 'key-contact', 'strategic']
      },
      {
        // Prospect with minimal info
        id: this.generateDeterministicUuid('contact', 'edge-prospect'),
        first_name: 'Unknown',
        last_name: 'Prospect',
        email: 'info@prospect-company.com',
        contact_type: 'prospect',
        status: 'pending',
        priority: 'low',
        is_active: true,
        company: 'Prospect Company',
        job_title: null,
        phone: null,
        mobile: null,
        address: null,
        source: 'cold_call',
        account_id: null,
        notes: 'Cold outreach. No response yet.',
        last_contacted: null,
        tags: ['cold-lead']
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