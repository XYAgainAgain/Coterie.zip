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

const ProjectPowerSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(1).max(5),
  tags: z.array(z.string()),
  requirements: z.string().nullable(),
  body: z.string().min(1),
  type: z.enum(['ritual', 'ceremony', 'sacrament', 'formula']),
});

export const DisciplineSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  intro: z.string().nullable(),
  perk: PerkSchema.nullable(),
  powers: z.array(PowerSchema),
  projectPowers: z.array(ProjectPowerSchema).default([]),
  status: z.enum(['complete', 'partial', 'stub']),
});

export const DisciplinesFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(DisciplineSchema).min(17),
});

export type Power = z.infer<typeof PowerSchema>;
export type DisciplinePerk = z.infer<typeof PerkSchema>;
export type ProjectPower = z.infer<typeof ProjectPowerSchema>;
export type ProjectPowerType = ProjectPower['type'];
export type Discipline = z.infer<typeof DisciplineSchema>;
export type DisciplinesFile = z.infer<typeof DisciplinesFileSchema>;
