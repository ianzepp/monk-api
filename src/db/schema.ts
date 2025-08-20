import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";

const baseFields = {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain"), // Nullable - null means public/shared
    access_read: uuid("access_read").array().default(sql`'{}'::uuid[]`),
    access_edit: uuid("access_edit").array().default(sql`'{}'::uuid[]`),
    access_full: uuid("access_full").array().default(sql`'{}'::uuid[]`),
    access_deny: uuid("access_deny").array().default(sql`'{}'::uuid[]`),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
};

// Hardcoded schemas removed - all user schemas created via meta API

// Schema registry table to store JSON Schema definitions
export const schemas = pgTable("schemas", {
    ...baseFields,
    name: text("name").notNull().unique(),
    table_name: text("table_name").notNull().unique(),
    status: text("status").notNull().default("pending"), // pending, active, disabled
    definition: jsonb("definition").notNull(), // Full JSON Schema
    field_count: text("field_count").notNull(),
    yaml_checksum: text("yaml_checksum"), // SHA256 checksum of YAML content for cache validation
});

// Column registry table to store individual field metadata
export const columns = pgTable("columns", {
    ...baseFields,
    schema_name: text("schema_name").notNull().references(() => schemas.name),
    column_name: text("column_name").notNull(),
    pg_type: text("pg_type").notNull(), // PostgreSQL column type
    is_required: text("is_required").notNull().default("false"), // "true" or "false"
    default_value: text("default_value"), // Default value if any
    constraints: jsonb("constraints"), // JSON Schema constraints (min, max, enum, etc.)
    foreign_key: jsonb("foreign_key"), // Foreign key metadata if applicable
    description: text("description"),
});

// Only meta table types - user schema types generated dynamically
export type Schema = typeof schemas.$inferSelect;
export type NewSchema = typeof schemas.$inferInsert;
export type Column = typeof columns.$inferSelect;
export type NewColumn = typeof columns.$inferInsert;
