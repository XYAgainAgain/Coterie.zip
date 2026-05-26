import { z } from 'zod';

const MeritFlawField = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export const PredatorTypeSchema = z.object({
  name: z.string().min(1),
  huntingStat: z.string().min(1),
  discipline: z.string().min(1),
  merit: MeritFlawField,
  flaw: MeritFlawField,
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
