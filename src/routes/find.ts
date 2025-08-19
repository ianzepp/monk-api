import { Hono } from 'hono';
import FindHandler from './find-handler.js';

const app = new Hono();

// POST /api/find/:schema - Advanced query with filter DSL
app.post('/:schema', FindHandler);

export default app;