import { createTestContextWithTemplate } from './spec/helpers/test-tenant.js';

async function testTemplate() {
  console.log('Testing template-based test creation...');
  const startTime = Date.now();
  
  try {
    const context = await createTestContextWithTemplate('basic');
    const setupTime = Date.now() - startTime;
    
    console.log(`✅ Template test context created in ${setupTime}ms`);
    console.log(`  - Template: ${context.templateName}`);
    console.log(`  - JWT Token: ${context.jwtToken ? 'Present' : 'Missing'}`);
    console.log(`  - Database: ${context.database ? 'Connected' : 'Not connected'}`);
    
    // Try to query data
    const accounts = await context.database.selectAny('account');
    console.log(`  - Account records: ${accounts.length}`);
    
    const contacts = await context.database.selectAny('contact');
    console.log(`  - Contact records: ${contacts.length}`);
    
    // Cleanup
    if (context.tenant) {
      await context.tenantService.deleteTenant(context.tenant.name, true);
    }
    
    console.log(`⚡ Total time: ${Date.now() - startTime}ms`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testTemplate();
