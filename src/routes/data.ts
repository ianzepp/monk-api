import { Hono, type Context } from 'hono';

// Router Imports
import DataSelectAny from './data-record-select-any.js';
import DataSelectOne from './data-record-select-one.js';
import DataCreateOne from './data-record-create-one.js';
import DataUpdateOne from './data-record-update-one.js';
import DataDeleteOne from './data-record-delete-one.js';

const app = new Hono();

// GET /api/data/:schema - List records
app.get('/:schema', DataSelectAny);

// GET /api/data/:schema/:id - Get specific record
app.get('/:schema/:id', DataSelectOne);

// POST /api/data/:schema - Create new record
app.post('/:schema', DataCreateOne);

// PUT /api/data/:schema/:id - Update existing record
app.put('/:schema/:id', DataUpdateOne);

// DELETE /api/data/:schema/:id - Delete record
app.delete('/:schema/:id', DataDeleteOne);

export default app;
