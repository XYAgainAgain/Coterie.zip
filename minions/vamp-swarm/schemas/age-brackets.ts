import { z } from 'zod';

export const AgeBracketSchema = z.object({
  name: z.string().min(1),
  embraced: z.string().min(1),
  flavor: z.string().nullable(),
  startingHumanity: z.string().min(1),
  startingBloodPotency: z.number().int().min(0).max(5),
  advancement: z.string().min(1),
  predatorType: z.string().min(1),
  narrativeFeel: z.string().min(1),
});

export const AgeBracketsFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(AgeBracketSchema).min(5),
});

export type AgeBracket = z.infer<typeof AgeBracketSchema>;
export type AgeBracketsFile = z.infer<typeof AgeBracketsFileSchema>;
