import { z } from 'zod';

const HungerTierSchema = z.object({
  level: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const SectionSchema = z.object({
  name: z.string().min(1),
  body: z.string().min(1),
});

export const HungerSchema = z.object({
  intro: z.string().min(1),
  tiers: z.array(HungerTierSchema).min(4),
  sections: z.array(SectionSchema).min(3),
});

export const HungerFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: HungerSchema,
});

export type Hunger = z.infer<typeof HungerSchema>;
export type HungerFile = z.infer<typeof HungerFileSchema>;
