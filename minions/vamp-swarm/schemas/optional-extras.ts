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

export const OptionalExtrasFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: z.object({
    clanBaneVariantsIntro: z.string().min(1),
    clanBaneVariants: z.array(ClanBaneVariantSchema).min(14),
    folkloricBanesIntro: z.string().min(1),
    folkloricBanes: z.array(FolkloricBaneSchema).min(10),
  }),
});

export type ClanBaneVariant = z.infer<typeof ClanBaneVariantSchema>;
export type FolkloricBane = z.infer<typeof FolkloricBaneSchema>;
export type OptionalExtrasFile = z.infer<typeof OptionalExtrasFileSchema>;
