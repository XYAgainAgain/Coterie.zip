import { z } from 'zod';

const PowerSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(1).max(5),
  tags: z.array(z.string()),
  body: z.string().min(1),
});

const PerkSchema = z.object({
  name: z.string().min(1),
  body: z.string().min(1),
});

export const DisciplineSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  intro: z.string().nullable(),
  perk: PerkSchema.nullable(),
  powers: z.array(PowerSchema),
  status: z.enum(['complete', 'partial', 'stub']),
});

export const DisciplinesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(DisciplineSchema).min(17),
});

export type Power = z.infer<typeof PowerSchema>;
export type DisciplinePerk = z.infer<typeof PerkSchema>;
export type Discipline = z.infer<typeof DisciplineSchema>;
export type DisciplinesFile = z.infer<typeof DisciplinesFileSchema>;
