import { resolve } from 'node:path';
import { readMarkdown } from '../common/io.js';
import {
  tokenize,
  splitByHeading,
  findFieldList,
  collectFields,
  requireField,
} from '../common/tokens.js';
import type { PredatorType } from '../schemas/predator-types.js';

const SOURCE = 'docs/your-kindred/predator-types.md';

const EXPECTED_LABELS = [
  'Hunting Stat',
  'Discipline',
  'Merit',
  'Flaw',
];

const KNOWN_LABELS = new Set([
  ...EXPECTED_LABELS,
  'Humanity',
  'Feeding Rules',
]);

export function parsePredatorTypes(repoRoot: string): PredatorType[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const tokens = tokenize(src);
  const sections = splitByHeading(tokens, 2);

  return sections.map(section => {
    const ctx = `Predator Types > ${section.name}`;
    let items;
    try {
      items = findFieldList(section.tokens, EXPECTED_LABELS);
    } catch {
      throw new Error(`[${ctx}] No field list found`);
    }
    const fields = collectFields(items);

    for (const label of fields.keys()) {
      if (!KNOWN_LABELS.has(label)) {
        console.warn(`[${ctx}] Unknown field label: "${label}"`);
      }
    }

    return {
      name: section.name,
      huntingStat: requireField(fields, 'Hunting Stat', ctx),
      discipline: requireField(fields, 'Discipline', ctx),
      merit: requireField(fields, 'Merit', ctx),
      flaw: requireField(fields, 'Flaw', ctx),
      humanity: fields.get('Humanity') ?? null,
      feedingRules: fields.get('Feeding Rules') ?? null,
    };
  });
}
