import { resolve } from 'node:path';
import { readMarkdown } from '../common/io.js';
import { type Token, type Tokens } from 'marked';
import {
  tokenize,
  splitByHeading,
  findFieldList,
  collectFields,
  requireField,
  extractBoldField,
  extractBoldFieldFromParagraph,
} from '../common/tokens.js';
import type { AgeBracket } from '../schemas/age-brackets.js';

const SOURCE = 'docs/the-vampiric-condition/age-brackets.md';

const EXPECTED_LABELS = [
  'Starting Humanity',
  'Starting Blood Potency',
  'Advancement',
  'Predator Type',
  'Narrative Feel',
];

const EXPECTED_SET = new Set(EXPECTED_LABELS);

function extractFlavor(tokens: Token[]): string | null {
  let afterEmbraced = false;
  const parts: string[] = [];

  for (const t of tokens) {
    if (!afterEmbraced) {
      if (t.type === 'paragraph' && t.raw.startsWith('**Embraced:')) {
        afterEmbraced = true;
      }
      continue;
    }
    if (t.type === 'list') {
      const list = t as Tokens.List;
      if (list.items.length > 0) {
        const first = extractBoldField(list.items[0]);
        if (first && EXPECTED_SET.has(first.label)) break;
      }
    }
    parts.push(t.raw);
  }

  const text = parts.join('').trim();
  return text || null;
}

export function parseAgeBrackets(repoRoot: string): AgeBracket[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const tokens = tokenize(src);
  const sections = splitByHeading(tokens, 2);

  return sections.map(section => {
    const ctx = `Age Brackets > ${section.name}`;

    const embracedField = extractBoldFieldFromParagraph(section.tokens);
    if (!embracedField || embracedField.label !== 'Embraced') {
      throw new Error(`[${ctx}] Expected **Embraced:** paragraph`);
    }

    const flavor = extractFlavor(section.tokens);

    let items;
    try {
      items = findFieldList(section.tokens, EXPECTED_LABELS);
    } catch {
      throw new Error(`[${ctx}] No stat field list found`);
    }
    const fields = collectFields(items);

    const bpRaw = requireField(fields, 'Starting Blood Potency', ctx);
    const bp = parseInt(bpRaw, 10);
    if (Number.isNaN(bp)) {
      throw new Error(`[${ctx}] Starting Blood Potency "${bpRaw}" is not a number`);
    }

    return {
      name: section.name,
      embraced: embracedField.value,
      flavor,
      startingHumanity: requireField(fields, 'Starting Humanity', ctx),
      startingBloodPotency: bp,
      advancement: requireField(fields, 'Advancement', ctx),
      predatorType: requireField(fields, 'Predator Type', ctx),
      narrativeFeel: requireField(fields, 'Narrative Feel', ctx),
    };
  });
}
