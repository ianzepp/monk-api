-- Monk API Definitions System
-- This file contains the JSON Schema definitions table and related functions

-- Definitions table to store compiled JSON Schema definitions
-- This table contains the generated JSON Schema built from schemas + columns metadata
CREATE TABLE "definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_id" uuid NOT NULL,
	"schema_name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_checksum" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schemas_id_schema_id_fk"
    FOREIGN KEY ("schema_id") REFERENCES "public"."schemas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schemas_name_schema_name_fk"
    FOREIGN KEY ("schema_name") REFERENCES "public"."schemas"("schema_name")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Add unique constraint and indexes
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schema_name_unique" UNIQUE("schema_name");
CREATE INDEX "idx_definitions_schema_id" ON "definitions" ("schema_id");
CREATE INDEX "idx_definitions_updated_at" ON "definitions" ("updated_at");

-- Add comments to document the table structure
COMMENT ON TABLE "definitions" IS 'Compiled JSON Schema definitions generated from schemas and columns metadata';
COMMENT ON COLUMN "definitions"."id" IS 'UUID primary key for definition record';
COMMENT ON COLUMN "definitions"."schema_id" IS 'Foreign key to schemas.id';
COMMENT ON COLUMN "definitions"."schema_name" IS 'Foreign key to schemas.name';
COMMENT ON COLUMN "definitions"."definition" IS 'Complete JSON Schema definition object compiled from columns metadata';
COMMENT ON COLUMN "definitions"."definition_checksum" IS 'SHA256 checksum of definition for change detection';
COMMENT ON COLUMN "definitions"."created_at" IS 'Timestamp when definition was first created';
COMMENT ON COLUMN "definitions"."updated_at" IS 'Timestamp when definition was last regenerated';

-- Function to regenerate JSON Schema definition from schemas and columns metadata
-- This function builds a complete JSON Schema object from normalized column data
CREATE OR REPLACE FUNCTION regenerate_schema_definition(p_schema_name text)
RETURNS void AS $$
DECLARE
    v_schema_id uuid;
    v_schema_description text;
    v_properties jsonb := '{}'::jsonb;
    v_required text[] := '{}';
    v_definition jsonb;
    v_checksum text;
    v_column record;
    v_property jsonb;
    v_type text;
BEGIN
    -- Fetch schema metadata
    SELECT id INTO v_schema_id
    FROM schemas
    WHERE schema_name = p_schema_name;

    IF v_schema_id IS NULL THEN
        RAISE EXCEPTION 'Schema not found: %', p_schema_name;
    END IF;

    -- Use schema name as description (can be enhanced later with a description column)
    v_schema_description := p_schema_name;

    -- Build properties object from columns
    FOR v_column IN
        SELECT
            column_name, type, required, default_value,
            minimum, maximum, pattern, enum_values, is_array,
            description, relationship_type, related_schema, related_column,
            relationship_name, cascade_delete, required_relationship
        FROM columns
        WHERE schema_name = p_schema_name
        ORDER BY column_name
    LOOP
        -- Start with base type mapping
        v_property := '{}'::jsonb;
        v_type := v_column.type::text;  -- Convert enum to text

        -- Map column type to JSON Schema type
        CASE
            WHEN v_type = 'text' THEN
                v_property := jsonb_build_object('type', 'string');
            WHEN v_type = 'integer' THEN
                v_property := jsonb_build_object('type', 'integer');
            WHEN v_type = 'numeric' THEN
                v_property := jsonb_build_object('type', 'number');
            WHEN v_type = 'boolean' THEN
                v_property := jsonb_build_object('type', 'boolean');
            WHEN v_type = 'jsonb' THEN
                v_property := jsonb_build_object('type', 'object');
            WHEN v_type = 'uuid' THEN
                v_property := jsonb_build_object('type', 'string', 'format', 'uuid');
            WHEN v_type = 'timestamp' THEN
                v_property := jsonb_build_object('type', 'string', 'format', 'date-time');
            WHEN v_type = 'date' THEN
                v_property := jsonb_build_object('type', 'string', 'format', 'date');
            WHEN v_type IN ('text[]', 'integer[]', 'numeric[]', 'uuid[]') THEN
                v_property := jsonb_build_object('type', 'array');
            ELSE
                v_property := jsonb_build_object('type', 'string');
        END CASE;

        -- Add validation constraints
        IF v_column.minimum IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('minimum', v_column.minimum);
        END IF;

        IF v_column.maximum IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('maximum', v_column.maximum);
        END IF;

        IF v_column.pattern IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('pattern', v_column.pattern);
        END IF;

        -- Handle enum values with nullable support (anyOf for Ajv)
        IF v_column.enum_values IS NOT NULL AND array_length(v_column.enum_values, 1) > 0 THEN
            -- Check if column allows NULL (not required)
            IF v_column.required = 'false' THEN
                -- Use anyOf to allow null or enum values for Ajv compatibility
                v_property := jsonb_build_object(
                    'anyOf',
                    jsonb_build_array(
                        jsonb_build_object('type', 'null'),
                        jsonb_build_object('enum', to_jsonb(v_column.enum_values))
                    )
                );
            ELSE
                -- Required field, just use enum
                v_property := v_property || jsonb_build_object('enum', to_jsonb(v_column.enum_values));
            END IF;
        END IF;

        IF v_column.default_value IS NOT NULL THEN
            -- Try to parse default value as JSON, fallback to string
            BEGIN
                v_property := v_property || jsonb_build_object('default', v_column.default_value::jsonb);
            EXCEPTION WHEN OTHERS THEN
                v_property := v_property || jsonb_build_object('default', v_column.default_value);
            END;
        END IF;

        IF v_column.description IS NOT NULL THEN
            v_property := v_property || jsonb_build_object('description', v_column.description);
        END IF;

        -- Add x-monk-relationship extension if relationship exists
        IF v_column.relationship_type IS NOT NULL THEN
            v_property := v_property || jsonb_build_object(
                'x-monk-relationship',
                jsonb_build_object(
                    'type', v_column.relationship_type,
                    'schema', v_column.related_schema,
                    'column', v_column.related_column,
                    'name', v_column.relationship_name,
                    'cascadeDelete', COALESCE(v_column.cascade_delete, false),
                    'required', COALESCE(v_column.required_relationship, false)
                )
            );
        END IF;

        -- Add property to properties object
        v_properties := v_properties || jsonb_build_object(v_column.column_name, v_property);

        -- Track required fields
        IF v_column.required = 'true' THEN
            v_required := array_append(v_required, v_column.column_name);
        END IF;
    END LOOP;

    -- Build complete JSON Schema definition
    v_definition := jsonb_build_object(
        'type', 'object',
        'title', p_schema_name,
        'description', v_schema_description,
        'properties', v_properties,
        'required', to_jsonb(v_required),
        'additionalProperties', false
    );

    -- Calculate checksum for change detection
    v_checksum := encode(digest(v_definition::text, 'sha256'), 'hex');

    -- Upsert into definitions table
    INSERT INTO definitions (schema_id, schema_name, definition, definition_checksum, created_at, updated_at)
    VALUES (v_schema_id, p_schema_name, v_definition, v_checksum, now(), now())
    ON CONFLICT (schema_name)
    DO UPDATE SET
        definition = EXCLUDED.definition,
        definition_checksum = EXCLUDED.definition_checksum,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION regenerate_schema_definition(text) IS 'Regenerates JSON Schema definition from schemas and columns metadata for the specified schema';

-- Trigger function to automatically regenerate definitions when columns change
-- This function handles INSERT, UPDATE, and DELETE operations on the columns table
-- Uses row-level trigger since PostgreSQL doesn't support REFERENCING with multiple events
CREATE OR REPLACE FUNCTION trigger_regenerate_schema_definitions()
RETURNS TRIGGER AS $$
BEGIN
    -- Regenerate definition for the affected schema
    IF TG_OP = 'DELETE' THEN
        PERFORM regenerate_schema_definition(OLD.schema_name);
    ELSE
        PERFORM regenerate_schema_definition(NEW.schema_name);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Row-level trigger on columns table
-- Fires for each row change to regenerate the affected schema's definition
CREATE TRIGGER trigger_columns_regenerate_definitions
AFTER INSERT OR UPDATE OR DELETE ON columns
FOR EACH ROW
EXECUTE FUNCTION trigger_regenerate_schema_definitions();

COMMENT ON FUNCTION trigger_regenerate_schema_definitions() IS 'Trigger function to automatically regenerate schema definitions when columns are modified';

-- Insert definition for schemas schema
INSERT INTO "definitions" (schema_id, schema_name, definition, definition_checksum)
SELECT
    s.id,
    'schemas',
    '{
        "type": "object",
        "title": "Schemas",
        "description": "Schema registry table for describe API schema definitions",
        "properties": {
            "schema_name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100,
                "description": "Unique schema name",
                "example": "accounts"
            },
            "status": {
                "type": "string",
                "enum": ["pending", "active", "disabled", "system"],
                "default": "pending",
                "description": "Schema status"
            }
        },
        "required": ["schema_name", "status"],
        "additionalProperties": false
    }'::jsonb,
    encode(digest('{
        "type": "object",
        "title": "Schemas",
        "description": "Schema registry table for describe API schema definitions",
        "properties": {
            "schema_name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100,
                "description": "Unique schema name",
                "example": "accounts"
            },
            "status": {
                "type": "string",
                "enum": ["pending", "active", "disabled", "system"],
                "default": "pending",
                "description": "Schema status"
            }
        },
        "required": ["schema_name", "status"],
        "additionalProperties": false
    }'::text, 'sha256'), 'hex')
FROM schemas s WHERE s.schema_name = 'schemas';

-- Insert definition for users schema
INSERT INTO "definitions" (schema_id, schema_name, definition, definition_checksum)
SELECT
    s.id,
    'users',
    '{
        "type": "object",
        "title": "Users",
        "description": "User management schema for tenant databases",
        "properties": {
            "name": {
                "type": "string",
                "minLength": 2,
                "maxLength": 100,
                "description": "Human-readable display name for the user",
                "example": "Jane Smith"
            },
            "auth": {
                "type": "string",
                "minLength": 2,
                "maxLength": 255,
                "description": "Authentication identifier (username, email, etc.)",
                "example": "jane@company.com"
            },
            "access": {
                "type": "string",
                "enum": ["root", "full", "edit", "read", "deny"],
                "description": "Access level for the user",
                "example": "full"
            }
        },
        "required": ["id", "name", "auth", "access"],
        "additionalProperties": false
    }'::jsonb,
    encode(digest('{
        "type": "object",
        "title": "Users",
        "description": "User management schema for tenant databases",
        "properties": {
            "name": {
                "type": "string",
                "minLength": 2,
                "maxLength": 100,
                "description": "Human-readable display name for the user",
                "example": "Jane Smith"
            },
            "auth": {
                "type": "string",
                "minLength": 2,
                "maxLength": 255,
                "description": "Authentication identifier (username, email, etc.)",
                "example": "jane@company.com"
            },
            "access": {
                "type": "string",
                "enum": ["root", "full", "edit", "read", "deny"],
                "description": "Access level for the user",
                "example": "full"
            }
        },
        "required": ["id", "name", "auth", "access"],
        "additionalProperties": false
    }'::text, 'sha256'), 'hex')
FROM schemas s WHERE s.schema_name = 'users';
