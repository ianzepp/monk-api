#!/usr/bin/env tsx

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { faker } from '@faker-js/faker';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const templateName = args[0];
const recordCount = parseInt(args[1]) || 100;

// Colors for output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
} as const;

function printStep(message: string): void {
    console.log(`${colors.blue}→ ${message}${colors.reset}`);
}

function printSuccess(message: string): void {
    console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function printError(message: string): void {
    console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function printWarning(message: string): void {
    console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

// Type definitions for generated records
interface AccountRecord {
    name: string;
    email: string;
    username: string;
    account_type: string;
    balance: number;
    is_active: boolean;
    is_verified: boolean;
    credit_limit?: number | null;
    last_login?: string | null;
    preferences?: {
        notifications: boolean;
        theme: string;
        language: string;
    };
    metadata?: {
        tags: string[];
        source: string;
    };
    phone?: string;
}

interface ContactRecord {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    notes?: string;
    status: string;
}

interface LockFileData {
    locked_at: string;
    locked_by?: string;
    reason?: string;
}

type GeneratorFunction = (index: number) => AccountRecord | ContactRecord;

// Generate valid phone number matching model pattern
function generateValidPhone(): string {
    // Pattern allows: ^\+?[1-9]\d{1,14}$|^\+?1 \([0-9]{3}\) [0-9]{3}-[0-9]{4}$

    if (faker.datatype.boolean(0.7)) {
        // Generate US format: +1 (555) 123-4567
        const area = faker.string.numeric(3, { bannedDigits: ['0', '1'] }); // Area code can't start with 0 or 1
        const exchange = faker.string.numeric(3);
        const number = faker.string.numeric(4);
        return `+1 (${area}) ${exchange}-${number}`;
    } else {
        // Generate international format: +[1-9][0-14 more digits]
        const countryCode = faker.helpers.arrayElement(['1', '44', '49', '33', '81', '61', '7']);
        const length = faker.number.int({ min: 6, max: 12 });
        const number = faker.string.numeric(length);
        return `+${countryCode}${number}`;
    }
}

// Account generator based on the model
function generateAccount(index: number): AccountRecord {
    const accountTypes = ['personal', 'business', 'trial', 'premium'];
    const themes = ['light', 'dark'];
    const languages = ['en', 'es'];

    const account: AccountRecord = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        username: faker.internet.username().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 46) + '_' + index.toString().padStart(4, '0'),
        account_type: faker.helpers.arrayElement(accountTypes),
        balance: parseFloat(faker.finance.amount({ min: 0, max: 10000, dec: 2 })),
        is_active: faker.datatype.boolean(0.8), // 80% chance of being active
        is_verified: faker.datatype.boolean(0.7), // 70% chance of being verified
    };

    // Optional fields
    if (faker.datatype.boolean(0.3)) {
        account.credit_limit = parseFloat(faker.finance.amount({ min: 1000, max: 10000, dec: 0 }));
    }

    if (faker.datatype.boolean(0.6)) {
        account.last_login = faker.date.recent({ days: 30 }).toISOString();
    }

    if (faker.datatype.boolean(0.4)) {
        account.preferences = {
            notifications: faker.datatype.boolean(),
            theme: faker.helpers.arrayElement(themes),
            language: faker.helpers.arrayElement(languages)
        };
    }

    if (faker.datatype.boolean(0.2)) {
        account.metadata = {
            tags: faker.helpers.arrayElements(['vip', 'beta', 'test', 'premium'], { min: 1, max: 3 }),
            source: faker.helpers.arrayElement(['web', 'mobile', 'api'])
        };
    }

    if (faker.datatype.boolean(0.6)) {
        account.phone = generateValidPhone();
    }

    return account;
}

// Generate valid contact phone number (simpler pattern)
function generateValidContactPhone(): string {
    // Pattern: ^\+?[1-9]\d{1,14}$ (no US format, just international)
    const countryCode = faker.helpers.arrayElement(['1', '44', '49', '33', '81', '61', '7']);
    const length = faker.number.int({ min: 6, max: 12 });
    const number = faker.string.numeric(length);
    return faker.datatype.boolean(0.8) ? `+${countryCode}${number}` : `${countryCode}${number}`;
}

// Contact generator based on the model
function generateContact(index: number): ContactRecord {
    const contact: ContactRecord = {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        status: faker.helpers.arrayElement(['active', 'inactive', 'prospect'])
    };

    if (faker.datatype.boolean(0.8)) {
        contact.phone = generateValidContactPhone();
    }

    if (faker.datatype.boolean(0.6)) {
        contact.company = faker.company.name();
    }

    if (faker.datatype.boolean(0.7)) {
        contact.notes = faker.lorem.paragraph();
    }

    return contact;
}

const generators: Record<string, GeneratorFunction> = {
    'account.json': generateAccount,
    'contact.json': generateContact
};

function checkLockFile(fixturesDir: string): void {
    const lockFile = join(fixturesDir, '.locked');

    if (existsSync(lockFile)) {
        printError(`Template '${templateName}' is locked and cannot be regenerated`);
        printStep('Lock details:');

        try {
            const lockData: LockFileData = JSON.parse(readFileSync(lockFile, 'utf8'));
            console.log(JSON.stringify(lockData, null, 2));
        } catch (error) {
            console.log(readFileSync(lockFile, 'utf8'));
        }

        printStep(`To unlock: rm ${lockFile}`);
        process.exit(1);
    }
}

async function generateFixtures(): Promise<void> {
    // Validate arguments
    if (!templateName) {
        printError('Usage: npm run fixtures:generate <template-name> <record-count>');
        printError('Example: npm run fixtures:generate testing_large 1000');
        printError('Example: npm run fixtures:generate demo_small 50');
        process.exit(1);
    }

    // Validate template name format
    if (!/^[a-z_]+$/.test(templateName)) {
        printError('Template name must contain only lowercase letters and underscores');
        printError(`Invalid name: '${templateName}'`);
        printError('Valid examples: testing_xl, demo_small, test_data');
        printError('Invalid examples: Basic-Large, demo-small, TestData');
        process.exit(1);
    }

    if (recordCount < 1 || recordCount > 10000) {
        printError('Record count must be between 1 and 10000');
        process.exit(1);
    }

    const fixturesDir = join(__dirname, '../fixtures', templateName);
    const sourceModelsDir = join(fixturesDir, 'describe');
    const outputDir = join(fixturesDir, 'data');

    // Check for lock file
    checkLockFile(fixturesDir);

    // Validate source template exists
    if (!existsSync(sourceModelsDir)) {
        printError(`Template describe directory not found: ${sourceModelsDir}`);
        printStep('Available templates:');

        const fixturesBaseDir = join(__dirname, '../fixtures');
        if (existsSync(fixturesBaseDir)) {
            const templates = readdirSync(fixturesBaseDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            templates.forEach(template => {
                const modelDir = join(fixturesBaseDir, template, 'describe');
                const status = existsSync(modelDir) ? '✓' : '✗ (no describe)';
                console.log(`  ${status} ${template}`);
            });
        }

        process.exit(1);
    }

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    // Read all model files
    const modelFiles = readdirSync(sourceModelsDir)
        .filter(file => file.endsWith('.json'));

    if (modelFiles.length === 0) {
        printError(`No model files found in: ${sourceModelsDir}`);
        process.exit(1);
    }

    printStep(`Generating fixtures for template: ${templateName}`);
    printStep(`Target: ${recordCount} records per model`);
    printStep(`Found ${modelFiles.length} models: ${modelFiles.join(', ')}`);

    for (const modelFile of modelFiles) {
        const generator = generators[modelFile];

        if (!generator) {
            printWarning(`No generator found for ${modelFile}, skipping...`);
            continue;
        }

        printStep(`Generating ${recordCount} records for ${modelFile}...`);

        const records: (AccountRecord | ContactRecord)[] = [];

        // Generate records
        for (let i = 0; i < recordCount; i++) {
            try {
                const record = generator(i);
                records.push(record);

                // Progress indicator for large datasets
                if (recordCount >= 100 && (i + 1) % Math.ceil(recordCount / 5) === 0) {
                    printStep(`  Generated ${i + 1}/${recordCount} records...`);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                printError(`Error generating record ${i} for ${modelFile}: ${message}`);
                process.exit(1);
            }
        }

        // Write generated data
        const outputFile = join(outputDir, modelFile);
        writeFileSync(outputFile, JSON.stringify(records, null, 2));

        const sizeKB = Math.round(statSync(outputFile).size / 1024);
        printSuccess(`Generated ${records.length} records for ${modelFile} (${sizeKB}KB)`);
    }

    printSuccess(`Fixture generation completed for template: ${templateName}`);
    printStep(`Output directory: ${outputDir}`);
    printStep(`To lock this template: npm run fixtures:lock ${templateName}`);
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    generateFixtures().catch(error => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        printError(`Error generating fixtures: ${message}`);
        process.exit(1);
    });
}

export { generateFixtures };
