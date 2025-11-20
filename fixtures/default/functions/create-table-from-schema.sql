-- ============================================================================
-- FUNCTION: create_table_from_schema
-- ============================================================================
-- Creates actual data tables from schema/column definitions
-- Reads from schemas/columns tables and generates DDL dynamically

CREATE OR REPLACE FUNCTION create_table_from_schema(p_schema_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_ddl TEXT;
    v_column RECORD;
    v_column_def TEXT;
    v_default_value TEXT;
    v_first_column BOOLEAN := TRUE;
BEGIN
    -- Check if schema exists
    IF NOT EXISTS (SELECT 1 FROM schemas WHERE schema_name = p_schema_name) THEN
        RAISE EXCEPTION 'Schema % does not exist in schemas table', p_schema_name;
    END IF;

    -- Start CREATE TABLE statement
    v_ddl := format('CREATE TABLE IF NOT EXISTS %I (', p_schema_name);
    v_ddl := v_ddl || E'\n';

    -- Add standard system fields
    v_ddl := v_ddl || '    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),' || E'\n';
    v_ddl := v_ddl || '    "access_read" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "access_edit" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "access_full" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "access_deny" UUID[] DEFAULT ''{}''::UUID[],' || E'\n';
    v_ddl := v_ddl || '    "created_at" TIMESTAMP DEFAULT now() NOT NULL,' || E'\n';
    v_ddl := v_ddl || '    "updated_at" TIMESTAMP DEFAULT now() NOT NULL,' || E'\n';
    v_ddl := v_ddl || '    "trashed_at" TIMESTAMP,' || E'\n';
    v_ddl := v_ddl || '    "deleted_at" TIMESTAMP,' || E'\n';

    -- Add custom columns from columns table
    FOR v_column IN
        SELECT column_name, type, required, default_value, "unique"
        FROM columns
        WHERE schema_name = p_schema_name
        ORDER BY column_name
    LOOP
        v_column_def := format('    %I %s', v_column.column_name, v_column.type);

        -- Add NOT NULL constraint if required
        IF v_column.required = 'true' THEN
            v_column_def := v_column_def || ' NOT NULL';
        END IF;

        -- Add DEFAULT value if specified
        IF v_column.default_value IS NOT NULL THEN
            -- Handle different types of default values
            CASE v_column.type
                WHEN 'boolean' THEN
                    v_column_def := v_column_def || format(' DEFAULT %s', v_column.default_value);
                WHEN 'integer', 'numeric' THEN
                    v_column_def := v_column_def || format(' DEFAULT %s', v_column.default_value);
                WHEN 'text', 'timestamp' THEN
                    v_column_def := v_column_def || format(' DEFAULT %L', v_column.default_value);
                ELSE
                    v_column_def := v_column_def || format(' DEFAULT %L', v_column.default_value);
            END CASE;
        END IF;

        v_ddl := v_ddl || v_column_def || ',' || E'\n';
    END LOOP;

    -- Remove trailing comma and newline, add closing parenthesis
    v_ddl := rtrim(v_ddl, ',' || E'\n') || E'\n);';

    -- Execute the DDL
    EXECUTE v_ddl;

    -- Create standard indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (created_at)',
        p_schema_name || '_created_at_idx', p_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (updated_at)',
        p_schema_name || '_updated_at_idx', p_schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (deleted_at) WHERE deleted_at IS NULL',
        p_schema_name || '_deleted_at_idx', p_schema_name);

    -- Create unique indexes for columns marked as unique
    FOR v_column IN
        SELECT column_name
        FROM columns
        WHERE schema_name = p_schema_name
          AND "unique" = true
    LOOP
        EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (%I)',
            p_schema_name || '_' || v_column.column_name || '_unique_idx',
            p_schema_name,
            v_column.column_name);
    END LOOP;

    -- Update schema status to active
    UPDATE schemas SET status = 'active' WHERE schema_name = p_schema_name;

    RETURN format('Table %I created successfully', p_schema_name);
END;
$$ LANGUAGE plpgsql;
