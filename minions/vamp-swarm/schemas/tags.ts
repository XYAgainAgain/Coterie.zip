import { z } from 'zod';

const TagSchema = z.object({
  name: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  effect: z.string().min(1),
});

export const TagsFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(TagSchema).min(100),
});

export type Tag = z.infer<typeof TagSchema>;
export type TagsFile = z.infer<typeof TagsFileSchema>;
