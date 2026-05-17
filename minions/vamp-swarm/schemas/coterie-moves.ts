import { z } from 'zod';

const GroupTierSchema = z.object({
  tier: z.string().min(1),
  description: z.string().min(1),
});

export const CoterieMoveSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  countRule: z.string().min(1),
  tiers: z.array(GroupTierSchema).min(4),
  holdOptions: z.array(z.string().min(1)).nullable(),
});

export const CoterieMovesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(CoterieMoveSchema).min(5),
});

export type CoterieMove = z.infer<typeof CoterieMoveSchema>;
export type CoterieMovesFile = z.infer<typeof CoterieMovesFileSchema>;
