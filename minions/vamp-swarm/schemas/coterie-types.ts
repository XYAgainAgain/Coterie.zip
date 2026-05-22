import { z } from 'zod';

const HavenFeaturesSchema = z.object({
  positiveCount: z.number().int().min(1),
  positiveOptions: z.array(z.string().min(1)).min(1),
  negativeCount: z.number().int().min(1),
  negativeOptions: z.array(z.string().min(1)).min(1),
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
