import { z } from 'zod';

const OutcomeTierSchema = z.object({
  tier: z.string().min(1),
  content: z.string().min(1),
});

const HumanityThresholdSchema = z.object({
  threshold: z.string().min(1),
  description: z.string().min(1),
});

const StandardMoveSchema = z.object({
  type: z.literal('standard'),
  name: z.string().min(1),
  trigger: z.string().min(1),
  rollStat: z.string().nullable(),
  statOptions: z.array(z.string().min(1)).nullable(),
  outcomes: z.array(OutcomeTierSchema).min(3),
});

const BlushOfLifeSchema = z.object({
  type: z.literal('blush-of-life'),
  name: z.literal('Blush of Life'),
  trigger: z.string().min(1),
  humanityThresholds: z.array(HumanityThresholdSchema).min(5),
  advanced: z.string().nullable(),
});

export const BasicMoveSchema = z.discriminatedUnion('type', [
  StandardMoveSchema,
  BlushOfLifeSchema,
]);

export const BasicMovesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(BasicMoveSchema).min(12),
});

export type StandardMove = z.infer<typeof StandardMoveSchema>;
export type BlushOfLife = z.infer<typeof BlushOfLifeSchema>;
export type BasicMove = z.infer<typeof BasicMoveSchema>;
export type BasicMovesFile = z.infer<typeof BasicMovesFileSchema>;
