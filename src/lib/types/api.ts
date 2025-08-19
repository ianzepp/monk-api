import { z } from "zod";

const baseRecordSchema = z.object({
    id: z.string().uuid(),
    domain: z.string().nullable(),
    access_read: z.array(z.string().uuid()).default([]),
    access_edit: z.array(z.string().uuid()).default([]),
    access_full: z.array(z.string().uuid()).default([]),
    access_deny: z.array(z.string().uuid()).default([]),
    created_at: z.date(),
    updated_at: z.date(),
});

const baseCreateSchema = z.object({
    domain: z.string().min(1).optional(),
    access_read: z.array(z.string().uuid()).optional(),
    access_edit: z.array(z.string().uuid()).optional(),
    access_full: z.array(z.string().uuid()).optional(),
    access_deny: z.array(z.string().uuid()).optional(),
});

const baseUpdateSchema = baseCreateSchema.partial();

// Hardcoded schemas removed - validators generated dynamically from schema registry

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
    z.object({
        data: dataSchema,
        success: z.boolean(),
    });

export const apiErrorSchema = z.object({
    error: z.string(),
    success: z.literal(false),
    data: z.any().optional(), // Optional contextual data for errors
});

export type ApiResponse<T> =
    | {
          data: T;
          success: true;
      }
    | {
          error: string;
          success: false;
          data?: any; // Optional contextual data for errors
      };

// Schema and column validators (simplified for meta operations)
const baseMetaSchema = baseCreateSchema;
const metaUpdateSchema = baseCreateSchema.partial();

// System schemas only - user schema validators generated dynamically
export const systemSchemaValidators = {
    schema: {
        create: baseMetaSchema,
        update: metaUpdateSchema,
        response: baseRecordSchema,
    },
    column: {
        create: baseMetaSchema,
        update: metaUpdateSchema,
        response: baseRecordSchema,
    },
} as const;

// Legacy - will be replaced by dynamic validator loading
export const schemaValidators = systemSchemaValidators;
