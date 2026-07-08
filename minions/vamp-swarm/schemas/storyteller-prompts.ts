import { z } from 'zod';

export const StMoveCategorySchema = z.object({
  category: z.string().min(1),
  soft: z.array(z.string()),
  hard: z.array(z.string()),
});

/* Arrays carry no .min(): the ST Moves live in a pre-publication dev doc, so an empty
   list is the correct graceful output in CI rather than a build failure. */
export const StPromptsFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: z.object({
    discernVibes: z.array(z.string()),
    catchTheScent: z.array(z.string()),
    stMoves: z.array(StMoveCategorySchema),
  }),
});

export type StMoveCategory = z.infer<typeof StMoveCategorySchema>;
export type StPromptsData = z.infer<typeof StPromptsFileSchema>['data'];
export type StPromptsFile = z.infer<typeof StPromptsFileSchema>;
