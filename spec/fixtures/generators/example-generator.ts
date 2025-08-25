/**
 * Example Generator
 * 
 * Generates example records demonstrating various field types and patterns
 * for comprehensive testing of different data scenarios.
 */

import { BaseGenerator } from './base-generator.js';
import { GeneratedRecord, DataGeneratorOptions, GeneratorContext } from '@src/lib/fixtures/types.js';

export class ExampleGenerator extends BaseGenerator {
  
  private readonly titles = [
    'Project Alpha', 'Initiative Beta', 'Research Gamma', 'Task Delta', 'Document Epsilon',
    'Report Zeta', 'Analysis Eta', 'Study Theta', 'Review Iota', 'Assessment Kappa',
    'Evaluation Lambda', 'Investigation Mu', 'Proposal Nu', 'Blueprint Xi', 'Strategy Omicron',
    'Framework Pi', 'Roadmap Rho', 'Design Sigma', 'Specification Tau', 'Architecture Upsilon'
  ];
  
  private readonly descriptions = [
    'Comprehensive analysis of system performance metrics and optimization opportunities',
    'Strategic initiative for improving operational efficiency across departments',
    'Research project focused on emerging technologies and market trends',
    'Documentation of best practices and implementation guidelines',
    'Evaluation of current processes and recommendations for improvement',
    'Investigation into customer behavior patterns and preferences',
    'Proposal for new feature development and resource allocation',
    'Technical specification for system architecture redesign',
    'Detailed roadmap for product development milestones',
    'Assessment of risk factors and mitigation strategies'
  ];
  
  private readonly statuses = ['draft', 'pending', 'approved', 'rejected', 'archived'];
  private readonly categories = ['technology', 'business', 'education', 'health', 'entertainment', 'other'];
  private readonly tags = [
    'important', 'review', 'urgent', 'v2', 'beta', 'production',
    'testing', 'documentation', 'security', 'performance', 'ui-ux',
    'backend', 'frontend', 'api', 'database', 'infrastructure'
  ];
  
  generate(count: number, options: DataGeneratorOptions, context?: GeneratorContext): GeneratedRecord[] {
    const examples: GeneratedRecord[] = [];
    
    for (let i = 0; i < count; i++) {
      const exampleId = this.generateDeterministicUuid('example', `example-${i}`);
      const createdAt = this.generateCreatedDate(i);
      const updatedAt = this.generateUpdatedDate(createdAt, i);
      
      const example: GeneratedRecord = {
        id: exampleId,
        title: this.generateTitle(i, options),
        description: this.generateDescription(i, options),
        status: this.generateStatus(i),
        priority: this.generatePriority(i),
        value: this.generateValue(i),
        percentage: this.generatePercentage(i),
        is_featured: this.generateFeaturedStatus(i),
        tags: this.generateTags(i),
        category: this.generateCategory(i),
        created_at: createdAt,
        updated_at: updatedAt,
        expires_at: this.generateExpiresAt(createdAt, i),
        author: this.generateAuthor(i, options),
        settings: this.generateSettings(i),
        metadata: this.generateMetadata(i)
      };
      
      examples.push(example);
    }
    
    // Add edge cases if requested
    if (options.include_edge_cases) {
      examples.push(...this.generateEdgeCases());
    }
    
    return examples;
  }
  
  /**
   * Generate title with realistic variations
   */
  private generateTitle(index: number, options: DataGeneratorOptions): string {
    if (options.realistic_names) {
      return this.getRandomItem(this.titles);
    }
    return `Example Title ${index + 1}`;
  }
  
  /**
   * Generate description with realistic content
   */
  private generateDescription(index: number, options: DataGeneratorOptions): string | null {
    // 10% have no description
    if (index % 10 === 0) {
      return null;
    }
    
    if (options.realistic_names) {
      return this.getRandomItem(this.descriptions);
    }
    return `Description for example ${index + 1}`;
  }
  
  /**
   * Generate status with realistic distribution
   */
  private generateStatus(index: number): string {
    if (index % 2 === 0) return 'approved';     // 50% approved
    if (index % 5 === 1) return 'pending';      // 20% pending
    if (index % 7 === 2) return 'draft';        // ~14% draft
    if (index % 11 === 3) return 'rejected';    // ~9% rejected
    return 'archived';                          // ~7% archived
  }
  
  /**
   * Generate priority (1-5)
   */
  private generatePriority(index: number): number {
    if (index % 10 === 0) return 5;  // 10% highest priority
    if (index % 5 === 1) return 4;   // 20% high priority
    if (index % 7 === 2) return 2;   // ~14% low priority
    if (index % 9 === 3) return 1;   // ~11% lowest priority
    return 3;                         // ~45% medium priority
  }
  
  /**
   * Generate value with realistic distribution
   */
  private generateValue(index: number): number {
    const seed = this.seededRandom(`value-${index}`);
    
    if (seed > 0.95) {
      // 5% have very high values ($10,000-$100,000)
      return Math.round((10000 + seed * 90000) * 100) / 100;
    } else if (seed > 0.8) {
      // 15% have high values ($1,000-$10,000)
      return Math.round((1000 + seed * 9000) * 100) / 100;
    } else if (seed > 0.5) {
      // 30% have medium values ($100-$1,000)
      return Math.round((100 + seed * 900) * 100) / 100;
    } else {
      // 50% have low values ($0-$100)
      return Math.round((seed * 100) * 100) / 100;
    }
  }
  
  /**
   * Generate percentage (0-100)
   */
  private generatePercentage(index: number): number {
    const seed = this.seededRandom(`percentage-${index}`);
    return Math.round(seed * 100 * 10) / 10; // One decimal place
  }
  
  /**
   * Generate featured status (20% featured)
   */
  private generateFeaturedStatus(index: number): boolean {
    return index % 5 === 0;
  }
  
  /**
   * Generate tags array
   */
  private generateTags(index: number): string[] {
    // 30% have no tags
    if (index % 10 < 3) {
      return [];
    }
    
    const tagCount = Math.floor(Math.random() * 5) + 1; // 1-5 tags
    return this.getRandomItems(this.tags, Math.min(tagCount, 10)); // Max 10 tags per schema
  }
  
  /**
   * Generate category with realistic distribution
   */
  private generateCategory(index: number): string {
    if (index % 3 === 0) return 'technology';      // 33% technology
    if (index % 4 === 1) return 'business';        // 25% business
    if (index % 5 === 2) return 'education';       // 20% education
    if (index % 7 === 3) return 'health';          // ~14% health
    if (index % 11 === 4) return 'entertainment';  // ~9% entertainment
    return 'other';                                // Remaining other
  }
  
  /**
   * Generate creation date
   */
  private generateCreatedDate(index: number): string {
    // Examples created over the last 6 months
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const createdDate = this.generateDateInRange(sixMonthsAgo, now);
    
    return createdDate.toISOString();
  }
  
  /**
   * Generate updated date (always after created date)
   */
  private generateUpdatedDate(createdAt: string, index: number): string {
    const created = new Date(createdAt);
    const now = new Date();
    
    // 20% haven't been updated (same as created)
    if (index % 5 === 0) {
      return createdAt;
    }
    
    const updated = this.generateDateInRange(created, now);
    return updated.toISOString();
  }
  
  /**
   * Generate expiration date (optional)
   */
  private generateExpiresAt(createdAt: string, index: number): string | null {
    // 70% don't expire
    if (index % 10 < 7) {
      return null;
    }
    
    const created = new Date(createdAt);
    const oneYearLater = new Date(created.getFullYear() + 1, created.getMonth(), created.getDate());
    const expiresAt = this.generateDateInRange(created, oneYearLater);
    
    return expiresAt.toISOString();
  }
  
  /**
   * Generate author object
   */
  private generateAuthor(index: number, options: DataGeneratorOptions): object {
    const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Hannah'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
    
    const firstName = this.getRandomItem(firstNames);
    const lastName = this.getRandomItem(lastNames);
    
    const roles = ['admin', 'editor', 'viewer'];
    let role: string;
    
    if (index % 10 === 0) {
      role = 'admin';     // 10% admins
    } else if (index % 4 === 1) {
      role = 'editor';    // 25% editors
    } else {
      role = 'viewer';    // 65% viewers
    }
    
    return {
      name: `${firstName} ${lastName}`,
      email: this.generateRealisticEmail(firstName, lastName),
      role: role
    };
  }
  
  /**
   * Generate settings object
   */
  private generateSettings(index: number): object {
    return {
      allow_comments: index % 4 !== 0,  // 75% allow comments
      visibility: this.generateVisibility(index),
      max_revisions: this.generateMaxRevisions(index)
    };
  }
  
  /**
   * Generate visibility setting
   */
  private generateVisibility(index: number): string {
    if (index % 2 === 0) return 'public';      // 50% public
    if (index % 5 === 1) return 'private';     // 20% private
    return 'restricted';                       // 30% restricted
  }
  
  /**
   * Generate max revisions (1-100)
   */
  private generateMaxRevisions(index: number): number {
    if (index % 10 === 0) return 100;  // 10% unlimited (max)
    if (index % 5 === 1) return 50;    // 20% high limit
    if (index % 3 === 2) return 5;     // ~33% low limit
    return 10;                          // ~37% default
  }
  
  /**
   * Generate metadata object
   */
  private generateMetadata(index: number): object {
    const metadata: any = {
      source: index % 3 === 0 ? 'import' : 'manual',
      version: `1.0.${index}`,
      reviewed: index % 4 === 0
    };
    
    // Add optional metadata for some records
    if (index % 5 === 0) {
      metadata.department = 'Engineering';
      metadata.cost_center = 'CC-1001';
    }
    
    if (index % 7 === 0) {
      metadata.external_id = `EXT-${1000 + index}`;
      metadata.integration_source = 'API';
    }
    
    return metadata;
  }
  
  /**
   * Generate edge case records
   */
  private generateEdgeCases(): GeneratedRecord[] {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    return [
      {
        id: this.generateDeterministicUuid('example', 'edge-minimal'),
        title: 'M',
        description: null,
        status: 'draft',
        priority: 1,
        value: 0,
        percentage: 0,
        is_featured: false,
        tags: [],
        category: 'other',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        expires_at: null,
        author: {
          name: 'A',
          email: 'a@b.c',
          role: 'viewer'
        },
        settings: {
          allow_comments: false,
          visibility: 'private',
          max_revisions: 1
        },
        metadata: {}
      },
      {
        id: this.generateDeterministicUuid('example', 'edge-maximum'),
        title: 'A'.repeat(200), // Max length title
        description: 'B'.repeat(1000), // Max length description
        status: 'archived',
        priority: 5,
        value: 100000.00,
        percentage: 100.0,
        is_featured: true,
        tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8', 'tag9', 'tag10'],
        category: 'technology',
        created_at: yesterday.toISOString(),
        updated_at: now.toISOString(),
        expires_at: tomorrow.toISOString(),
        author: {
          name: 'C'.repeat(100), // Max length name
          email: 'very.long.email.address.for.testing@very-long-domain-name-example.com',
          role: 'admin'
        },
        settings: {
          allow_comments: true,
          visibility: 'public',
          max_revisions: 100
        },
        metadata: {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
          nested: {
            level1: {
              level2: 'deep'
            }
          }
        }
      },
      {
        id: this.generateDeterministicUuid('example', 'edge-special-chars'),
        title: 'Test "Title" with \'Special\' Characters & Symbols',
        description: 'Description with émojis 🎉 and spëcial çhars: <>&"\'',
        status: 'pending',
        priority: 3,
        value: 1234.56,
        percentage: 75.5,
        is_featured: false,
        tags: ['special-chars', 'test&debug', 'v1.0'],
        category: 'business',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        expires_at: null,
        author: {
          name: 'José O\'Reilly-Smith',
          email: 'jose.oreilly+test@example.com',
          role: 'editor'
        },
        settings: {
          allow_comments: true,
          visibility: 'restricted',
          max_revisions: 10
        },
        metadata: {
          unicode: '日本語テスト',
          special: '!@#$%^&*()',
          quotes: '"double" and \'single\''
        }
      }
    ];
  }
  
  /**
   * No dependencies for example generation
   */
  getDependencies(): string[] {
    return [];
  }
}