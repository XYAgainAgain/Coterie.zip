import { z } from 'zod';

const XPCostSchema = z.object({
  name: z.string().min(1),
  cost: z.string().min(1),
  description: z.string().min(1),
});

const XPSourceSchema = z.object({
  name: z.string().min(1),
  maxPerSession: z.string().min(1),
  description: z.string().min(1),
});

const SectionSchema = z.object({
  name: z.string().min(1),
  body: z.string().min(1),
});

export const AdvancementSchema = z.object({
  intro: z.string().min(1),
  xpSources: z.array(XPSourceSchema).min(4),
  xpCosts: z.array(XPCostSchema).min(4),
  sections: z.array(SectionSchema),
});

export const AdvancementFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: AdvancementSchema,
});

export type Advancement = z.infer<typeof AdvancementSchema>;
export type AdvancementFile = z.infer<typeof AdvancementFileSchema>;
