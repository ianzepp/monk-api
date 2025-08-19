import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const { Pool } = pg;

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://ianzepp@localhost:5432/monk_api_hono_dev';
  
  console.log('🚀 Running database migrations...');
  
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();