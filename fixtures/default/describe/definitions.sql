-- ============================================================================
-- SCHEMA: definitions
-- ============================================================================
-- Compiled JSON Schema definitions generated from schemas + columns metadata

CREATE TABLE "definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_id" uuid NOT NULL,
	"schema_name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_checksum" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign key constraints
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schemas_id_schema_id_fk"
    FOREIGN KEY ("schema_id") REFERENCES "public"."schemas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schemas_name_schema_name_fk"
    FOREIGN KEY ("schema_name") REFERENCES "public"."schemas"("schema_name")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint and indexes
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_schema_name_unique" UNIQUE("schema_name");
CREATE INDEX "idx_definitions_schema_id" ON "definitions" ("schema_id");
CREATE INDEX "idx_definitions_updated_at" ON "definitions" ("updated_at");

-- Comments
COMMENT ON TABLE "definitions" IS 'Compiled JSON Schema definitions generated from schemas and columns metadata';
COMMENT ON COLUMN "definitions"."id" IS 'UUID primary key for definition record';
COMMENT ON COLUMN "definitions"."schema_id" IS 'Foreign key to schemas.id';
COMMENT ON COLUMN "definitions"."schema_name" IS 'Foreign key to schemas.name';
COMMENT ON COLUMN "definitions"."definition" IS 'Complete JSON Schema definition object compiled from columns metadata';
COMMENT ON COLUMN "definitions"."definition_checksum" IS 'SHA256 checksum of definition for change detection';
COMMENT ON COLUMN "definitions"."created_at" IS 'Timestamp when definition was first created';
COMMENT ON COLUMN "definitions"."updated_at" IS 'Timestamp when definition was last regenerated';
