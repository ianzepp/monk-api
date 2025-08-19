import { Hono } from 'hono';
import BulkHandler from './bulk-handler.js';

const app = new Hono();

// POST /api/bulk - Execute multiple operations in single transaction
app.post('/', BulkHandler);

export default app;