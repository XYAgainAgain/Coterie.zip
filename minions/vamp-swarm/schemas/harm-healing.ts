import { z } from 'zod';

const HpTierSchema = z.object({
  bpRange: z.string().min(1),
  hp: z.number().int().positive(),
});

const EquipRowSchema = z.object({
  item: z.string().min(1),
  value: z.string().min(1),
});

const EquipTableSchema = z.object({
  name: z.string().min(1),
  rows: z.array(EquipRowSchema).min(1),
});

export const HarmHealingFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  data: z.object({
    intro: z.string().min(1),
    hpTiers: z.array(HpTierSchema).min(5),
    sections: z.array(z.object({
      name: z.string().min(1),
      body: z.string().min(1),
    })).min(1),
    equipTables: z.array(EquipTableSchema).min(2),
  }),
});

export type HpTier = z.infer<typeof HpTierSchema>;
export type EquipRow = z.infer<typeof EquipRowSchema>;
export type EquipTable = z.infer<typeof EquipTableSchema>;
export type HarmHealingFile = z.infer<typeof HarmHealingFileSchema>;
