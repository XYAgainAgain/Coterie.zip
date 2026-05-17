import { z } from 'zod';

const HumanityTierSchema = z.object({
  range: z.string().min(1),
  label: z.string().nullable(),
  description: z.string().min(1),
});

const SectionSchema = z.object({
  name: z.string().min(1),
  body: z.string().min(1),
});

export const HumanitySchema = z.object({
  intro: z.string().min(1),
  tiers: z.array(HumanityTierSchema).min(7),
  sections: z.array(SectionSchema).min(3),
});

export const HumanityFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: HumanitySchema,
});

export type Humanity = z.infer<typeof HumanitySchema>;
export type HumanityFile = z.infer<typeof HumanityFileSchema>;
