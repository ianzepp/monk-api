CREATE TABLE "columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"schema_name" text NOT NULL,
	"column_name" text NOT NULL,
	"pg_type" text NOT NULL,
	"is_required" text DEFAULT 'false' NOT NULL,
	"default_value" text,
	"constraints" jsonb,
	"foreign_key" jsonb,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "schema" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text,
	"access_read" uuid[] DEFAULT '{}'::uuid[],
	"access_edit" uuid[] DEFAULT '{}'::uuid[],
	"access_full" uuid[] DEFAULT '{}'::uuid[],
	"access_deny" uuid[] DEFAULT '{}'::uuid[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"table_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"definition" jsonb NOT NULL,
	"field_count" text NOT NULL,
	CONSTRAINT "schema_name_unique" UNIQUE("name"),
	CONSTRAINT "schema_table_name_unique" UNIQUE("table_name")
);
--> statement-breakpoint
ALTER TABLE "columns" ADD CONSTRAINT "columns_schema_name_schema_name_fk" FOREIGN KEY ("schema_name") REFERENCES "public"."schema"("name") ON DELETE no action ON UPDATE no action;