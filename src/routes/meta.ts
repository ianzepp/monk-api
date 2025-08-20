import { Hono } from 'hono';

// Router Imports
import MetaSchemaSelectAny from './meta-schema-select-any.js';
import MetaSchemaSelectOne from './meta-schema-select-one.js';
import MetaSchemaCreateOne from './meta-schema-create-one.js';
import MetaSchemaUpdateOne from './meta-schema-update-one.js';
import MetaSchemaDeleteOne from './meta-schema-delete-one.js';

const app = new Hono();

// GET /api/meta/schema - List schemas
app.get('/schema', MetaSchemaSelectAny);

// GET /api/meta/schema/:name - Get specific schema
app.get('/schema/:name', MetaSchemaSelectOne);

// POST /api/meta/schema - Create new schema
app.post('/schema', MetaSchemaCreateOne);

// PUT /api/meta/schema/:name - Update existing schema
app.put('/schema/:name', MetaSchemaUpdateOne);

// DELETE /api/meta/schema/:name - Delete schema
app.delete('/schema/:name', MetaSchemaDeleteOne);

export default app;