import { z } from 'zod';

export const PredatorTypeSchema = z.object({
  name: z.string().min(1),
  huntingStat: z.string().min(1),
  discipline: z.string().min(1),
  merit: z.string().min(1),
  flaw: z.string().min(1),
  humanity: z.string().nullable(),
  feedingRules: z.string().nullable(),
});

export const PredatorTypesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(PredatorTypeSchema).min(53),
});

export type PredatorType = z.infer<typeof PredatorTypeSchema>;
export type PredatorTypesFile = z.infer<typeof PredatorTypesFileSchema>;
