import { z } from 'zod';

const ClanBaneVariantSchema = z.object({
  clan: z.string().min(1),
  baneName: z.string().min(1),
  consequences: z.string().min(1),
});

const FolkloricBaneSchema = z.object({
  baneName: z.string().min(1),
  consequences: z.string().min(1),
  xpGain: z.string().min(1),
});

const MeritSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  limit: z.string(),
  description: z.string().min(1),
  xpCost: z.string().min(1),
});

const FlawSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  limit: z.string(),
  description: z.string().min(1),
  xpGain: z.string().min(1),
});

export const OptionalExtrasFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: z.object({
    clanBaneVariantsIntro: z.string().min(1),
    clanBaneVariants: z.array(ClanBaneVariantSchema).min(14),
    folkloricBanesIntro: z.string().min(1),
    folkloricBanes: z.array(FolkloricBaneSchema).min(10),
    merits: z.array(MeritSchema).min(1),
    flaws: z.array(FlawSchema).min(1),
  }),
});

export type ClanBaneVariant = z.infer<typeof ClanBaneVariantSchema>;
export type FolkloricBane = z.infer<typeof FolkloricBaneSchema>;
export type Merit = z.infer<typeof MeritSchema>;
export type Flaw = z.infer<typeof FlawSchema>;
export type OptionalExtrasFile = z.infer<typeof OptionalExtrasFileSchema>;
