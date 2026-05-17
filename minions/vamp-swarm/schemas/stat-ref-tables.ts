import { z } from 'zod';

const StatRowSchema = z.object({
  score: z.string().min(1),
  description: z.string().min(1),
});

const StatTableSchema = z.object({
  name: z.string().min(1),
  rows: z.array(StatRowSchema).min(7),
});

export const StatRefTablesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: z.object({
    tables: z.array(StatTableSchema).min(5),
  }),
});

export type StatRow = z.infer<typeof StatRowSchema>;
export type StatTable = z.infer<typeof StatTableSchema>;
export type StatRefTablesFile = z.infer<typeof StatRefTablesFileSchema>;
