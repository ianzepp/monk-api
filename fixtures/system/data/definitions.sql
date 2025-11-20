-- ============================================================================
-- DATA: Generate JSON Schema definitions
-- ============================================================================
-- Regenerate schema definitions from columns metadata
-- This ensures definitions are always in sync with columns table

SELECT regenerate_schema_definition('schemas');
SELECT regenerate_schema_definition('columns');
SELECT regenerate_schema_definition('users');
SELECT regenerate_schema_definition('history');
SELECT regenerate_schema_definition('snapshots');
