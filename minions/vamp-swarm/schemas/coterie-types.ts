import { z } from 'zod';

const HavenFeaturesSchema = z.object({
  positiveCount: z.number().int().min(1),
  positiveOptions: z.array(z.string().min(1)).min(1),
  negativeCount: z.number().int().min(1),
  negativeOptions: z.array(z.string().min(1)).min(1),
  // True for "The Uncategorizable": options are the aggregate pool of every
  // other type, so the UI renders dropdowns rather than a fixed pill set.
  aggregate: z.boolean(),
  // Authored "invent your own" guidance, present only when aggregate is true.
  positiveNote: z.string().min(1).nullable(),
  negativeNote: z.string().min(1).nullable(),
});

export const CoterieTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  coterieStats: z.string().min(1),
  havenFeatures: HavenFeaturesSchema,
});

export const CoterieTypesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(CoterieTypeSchema).min(15),
});

export type CoterieType = z.infer<typeof CoterieTypeSchema>;
export type CoterieTypesFile = z.infer<typeof CoterieTypesFileSchema>;
