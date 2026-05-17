import { z } from 'zod';

export const SnippetEntrySchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  snippet: z.string().min(1),
});

export const SnippetsFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(SnippetEntrySchema).min(1),
});

export type SnippetEntry = z.infer<typeof SnippetEntrySchema>;
export type SnippetsFile = z.infer<typeof SnippetsFileSchema>;
