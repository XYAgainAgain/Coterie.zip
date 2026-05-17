import { z } from 'zod';

const ArchetypeSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
  stats: z.string().min(1),
});

const PerkSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export const PlaybookSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['clan', 'clanless']),
  tagline: z.string().min(1),
  whatAreYou: z.string().min(1),
  disciplines: z.string().min(1),
  baneName: z.string().min(1),
  baneDescription: z.string().min(1),
  compulsionName: z.string().nullable(),
  compulsionDescription: z.string().min(1),
  perks: z.array(PerkSchema).min(1),
  xpTriggers: z.array(z.string().min(1)).min(1),
  xpExtra: z.string().nullable(),
  archetypes: z.array(ArchetypeSchema).min(3),
  customStatSpread: z.string().min(1),
});

export const PlaybooksFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  entries: z.array(PlaybookSchema).min(21),
});

export type Archetype = z.infer<typeof ArchetypeSchema>;
export type Perk = z.infer<typeof PerkSchema>;
export type Playbook = z.infer<typeof PlaybookSchema>;
export type PlaybooksFile = z.infer<typeof PlaybooksFileSchema>;
