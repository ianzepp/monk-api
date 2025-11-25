/**
 * Extract API Route Barrel Export
 *
 * Extract job execution and artifact download operations:
 * - Extract execution: ExtractRun, ExtractExecute, ExtractCancel
 * - Artifact downloads: RunDownload, ArtifactDownload
 */

// Extract execution operations
export { default as ExtractRun } from '@src/routes/api/extracts/:record/run/POST.js';
export { default as ExtractExecute } from '@src/routes/api/extracts/:record/execute/POST.js';
export { default as ExtractCancel } from '@src/routes/api/extracts/:record/cancel/POST.js';

// Artifact download operations
export { default as RunDownload } from '@src/routes/api/extracts/runs/:runId/download/GET.js';
export { default as ArtifactDownload } from '@src/routes/api/extracts/artifacts/:artifactId/download/GET.js';
