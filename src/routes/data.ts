import { Hono, type Context } from 'hono';

// Router Imports
import DataSelectAny from './data-record-select-any.js';
import DataSelectOne from './data-record-select-one.js';
import DataCreateAll from './data-record-create-all.js';
import DataUpdateOne from './data-record-update-one.js';
import DataUpdateAll from './data-record-update-all.js';
import DataDeleteOne from './data-record-delete-one.js';
import DataDeleteAll from './data-record-delete-all.js';

const app = new Hono();

// GET /api/data/:schema - List records
app.get('/:schema', DataSelectAny);

// GET /api/data/:schema/:id - Get specific record
app.get('/:schema/:id', DataSelectOne);

// POST /api/data/:schema - Create new record(s) - handles both single objects and arrays
app.post('/:schema', DataCreateAll);

// PUT /api/data/:schema - Update multiple records by array of {id, ...updates}
app.put('/:schema', DataUpdateAll);

// PUT /api/data/:schema/:id - Update existing record by ID
app.put('/:schema/:id', DataUpdateOne);

// DELETE /api/data/:schema - Delete multiple records by array of {id} or IDs
app.delete('/:schema', DataDeleteAll);

// DELETE /api/data/:schema/:id - Delete record by ID
app.delete('/:schema/:id', DataDeleteOne);

export default app;
