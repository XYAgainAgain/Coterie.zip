import { z } from 'zod';

const FeedingRestrictionSchema = z.object({
  bpRange: z.string().min(1),
  description: z.string().min(1),
});

const BPEffectSchema = z.object({
  name: z.string().min(1),
  body: z.string().min(1),
});

export const BloodPotencySchema = z.object({
  intro: z.string().min(1),
  ageScaling: z.array(z.object({
    label: z.string().min(1),
    bp: z.number().int().min(0).max(5),
  })).min(5),
  feedingRestrictions: z.array(FeedingRestrictionSchema).min(5),
  advancementPenalties: z.array(z.object({
    bpRange: z.string().min(1),
    penalty: z.string().min(1),
  })).min(3),
  effects: z.array(BPEffectSchema).min(5),
});

export const BloodPotencyFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: BloodPotencySchema,
});

export type BloodPotency = z.infer<typeof BloodPotencySchema>;
export type BloodPotencyFile = z.infer<typeof BloodPotencyFileSchema>;
