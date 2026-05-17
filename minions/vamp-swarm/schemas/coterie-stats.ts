import { z } from 'zod';

export const CoterieStatSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  mechanic: z.string().nullable(),
  changesThrough: z.string().min(1),
});

export const CoterieStatsFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: z.object({
    intro: z.string().min(1),
    stats: z.array(CoterieStatSchema).min(5),
  }),
});

export type CoterieStat = z.infer<typeof CoterieStatSchema>;
export type CoterieStatsFile = z.infer<typeof CoterieStatsFileSchema>;
