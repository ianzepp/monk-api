import { Hono } from 'hono';
import { db, type TxContext } from '../db/index.js';
import { 
  createSuccessResponse, 
  createNotFoundError, 
  createValidationError,
  createInternalError 
} from '../lib/api/responses.js';
import { eq, sql } from 'drizzle-orm';
import { schema as dbSchema } from '../db/index.js';

const app = new Hono();

// GET /api/data/:schema - List records
app.get('/:schema', async (c) => {
  const schemaName = c.req.param('schema');
  
  try {
    // Check if schema exists and get table info
    const schemaInfo = await db.select()
      .from(dbSchema.schemas)
      .where(eq(dbSchema.schemas.name, schemaName))
      .limit(1);

    if (schemaInfo.length === 0) {
      return createNotFoundError(c, 'Schema', schemaName);
    }

    const tableName = schemaInfo[0].table_name;

    // Query the dynamic table directly
    // Note: In a real implementation, we'd build this query dynamically
    // For now, we'll use raw SQL to query the dynamic table
    const result = await db.execute(sql`
      SELECT * FROM ${sql.identifier(tableName)}
      ORDER BY created_at DESC
    `);

    return createSuccessResponse(c, result.rows);
  } catch (error) {
    console.error('Error listing records:', error);
    return createInternalError(c, 'Failed to list records');
  }
});

// GET /api/data/:schema/:id - Get specific record
app.get('/:schema/:id', async (c) => {
  const schemaName = c.req.param('schema');
  const recordId = c.req.param('id');

  try {
    // Check if schema exists
    const schemaInfo = await db.select()
      .from(dbSchema.schemas)
      .where(eq(dbSchema.schemas.name, schemaName))
      .limit(1);

    if (schemaInfo.length === 0) {
      return createNotFoundError(c, 'Schema', schemaName);
    }

    const tableName = schemaInfo[0].table_name;

    // Query for specific record
    const result = await db.execute(sql`
      SELECT * FROM ${sql.identifier(tableName)}
      WHERE id = ${recordId}
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return createNotFoundError(c, 'Record', recordId);
    }

    return createSuccessResponse(c, result.rows[0]);
  } catch (error) {
    console.error('Error getting record:', error);
    return createInternalError(c, 'Failed to get record');
  }
});

// POST /api/data/:schema - Create new record
app.post('/:schema', async (c) => {
  const schemaName = c.req.param('schema');

  try {
    const body = await c.req.json();

    // Use transaction for write operation
    const result = await db.transaction(async (tx: TxContext) => {
      // Check if schema exists
      const schemaInfo = await tx.select()
        .from(dbSchema.schemas)
        .where(eq(dbSchema.schemas.name, schemaName))
        .limit(1);

      if (schemaInfo.length === 0) {
        throw new Error(`Schema '${schemaName}' not found`);
      }

      const tableName = schemaInfo[0].table_name;

      // Generate new ID and add base fields
      const recordData = {
        id: crypto.randomUUID(),
        domain: body.domain || null,
        access_read: body.access_read || [],
        access_edit: body.access_edit || [],
        access_full: body.access_full || [],
        access_deny: body.access_deny || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body
      };

      // Build dynamic INSERT query
      const columns = Object.keys(recordData);
      const values = Object.values(recordData);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      // For dynamic queries, we'll use a simpler approach
      // Build the SQL manually with proper escaping
      const insertQuery = `
        INSERT INTO "${tableName}" 
        (${columns.map(col => `"${col}"`).join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;
      
      // Create SQL object with bound parameters
      const boundSQL = sql.raw(insertQuery);
      const insertResult = await tx.execute(sql.raw(insertQuery, ...values));

      return insertResult.rows[0];
    });

    return createSuccessResponse(c, result, 201);
  } catch (error) {
    console.error('Error creating record:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      return createNotFoundError(c, 'Schema', schemaName);
    }
    return createInternalError(c, 'Failed to create record');
  }
});

// PUT /api/data/:schema/:id - Update existing record
app.put('/:schema/:id', async (c) => {
  const schemaName = c.req.param('schema');
  const recordId = c.req.param('id');

  try {
    const body = await c.req.json();

    // Use transaction for write operation
    const result = await db.transaction(async (tx: TxContext) => {
      // Check if schema exists
      const schemaInfo = await tx.select()
        .from(dbSchema.schemas)
        .where(eq(dbSchema.schemas.name, schemaName))
        .limit(1);

      if (schemaInfo.length === 0) {
        throw new Error(`Schema '${schemaName}' not found`);
      }

      const tableName = schemaInfo[0].table_name;

      // Check if record exists
      const existingRecord = await tx.execute(sql`
        SELECT * FROM ${sql.identifier(tableName)}
        WHERE id = ${recordId}
        LIMIT 1
      `);

      if (existingRecord.rows.length === 0) {
        throw new Error(`Record '${recordId}' not found`);
      }

      // Update data with timestamp
      const updateData = {
        ...body,
        updated_at: new Date().toISOString()
      };

      // Build dynamic UPDATE query
      const setClause = Object.keys(updateData)
        .map((key, i) => `"${key}" = $${i + 1}`)
        .join(', ');
      const values = Object.values(updateData);

      // Simple approach: use parameterized query
      const updateQuery = `
        UPDATE "${tableName}"
        SET ${setClause}
        WHERE id = $${values.length + 1}
        RETURNING *
      `;
      
      const updateResult = await tx.execute(sql.raw(updateQuery, ...values, recordId));

      return updateResult.rows[0];
    });

    return createSuccessResponse(c, result);
  } catch (error) {
    console.error('Error updating record:', error);
    if (error instanceof Error) {
      if (error.message.includes('Schema') && error.message.includes('not found')) {
        return createNotFoundError(c, 'Schema', schemaName);
      }
      if (error.message.includes('Record') && error.message.includes('not found')) {
        return createNotFoundError(c, 'Record', recordId);
      }
    }
    return createInternalError(c, 'Failed to update record');
  }
});

// DELETE /api/data/:schema/:id - Delete record
app.delete('/:schema/:id', async (c) => {
  const schemaName = c.req.param('schema');
  const recordId = c.req.param('id');

  try {
    // Use transaction for write operation
    const result = await db.transaction(async (tx: TxContext) => {
      // Check if schema exists
      const schemaInfo = await tx.select()
        .from(dbSchema.schemas)
        .where(eq(dbSchema.schemas.name, schemaName))
        .limit(1);

      if (schemaInfo.length === 0) {
        throw new Error(`Schema '${schemaName}' not found`);
      }

      const tableName = schemaInfo[0].table_name;

      // Delete the record
      const deleteResult = await tx.execute(sql`
        DELETE FROM ${sql.identifier(tableName)}
        WHERE id = ${recordId}
        RETURNING id
      `);

      if (deleteResult.rows.length === 0) {
        throw new Error(`Record '${recordId}' not found`);
      }

      return { id: recordId, deleted: true };
    });

    return createSuccessResponse(c, result);
  } catch (error) {
    console.error('Error deleting record:', error);
    if (error instanceof Error) {
      if (error.message.includes('Schema') && error.message.includes('not found')) {
        return createNotFoundError(c, 'Schema', schemaName);
      }
      if (error.message.includes('Record') && error.message.includes('not found')) {
        return createNotFoundError(c, 'Record', recordId);
      }
    }
    return createInternalError(c, 'Failed to delete record');
  }
});

export default app;