import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, type Section } from '../common/tokens.js';
import type { CoterieMove } from '../schemas/coterie-moves.js';

const SOURCE = 'docs/your-coterie/coterie-moves.md';

const TIER_LABELS = [
  'Everyone rolls 10+',
  'Half or more succeed',
  'Less than half succeed',
  'Nobody succeeds',
];

const TIER_SPLIT_RE = /(?=\*\*(?:Everyone rolls 10\+|Half or more succeed|Less than half succeed|Nobody succeeds)[.:]\*\*)/;

function findTriggerParagraph(tokens: Token[]): string | null {
  for (const t of tokens) {
    if (t.type === 'paragraph' && t.raw.includes('**When ')) return t.raw;
  }
  return null;
}

function extractTrigger(paraRaw: string): string | null {
  const match = paraRaw.match(/\*\*When .+?\*\*/s);
  return match ? match[0].replace(/^\*\*/, '').replace(/\*\*$/, '').trim() : null;
}

function extractCountRule(tokens: Token[]): string | null {
  for (const t of tokens) {
    if (t.type !== 'paragraph') continue;
    const raw = t.raw.trim();
    if (raw.startsWith('**Count successes:')) return raw;
  }
  return null;
}

function parseGroupTiers(raw: string): { tier: string; description: string }[] {
  const tiers: { tier: string; description: string }[] = [];
  const chunks = raw.split(TIER_SPLIT_RE);

  for (const chunk of chunks) {
    const match = chunk.match(/^\*\*(.+?)[.:]\*\*\s*([\s\S]*)/);
    if (!match) continue;
    const label = match[1].trim();
    if (!TIER_LABELS.includes(label)) continue;
    const raw = match[2];
    const holdCut = raw.indexOf('**Spend Hold');
    const description = holdCut >= 0 ? raw.substring(0, holdCut).trim() : raw.trim();
    tiers.push({ tier: label, description });
  }

  return tiers;
}

function extractHoldOptions(tokens: Token[]): string[] | null {
  let foundSpendHeader = false;
  for (const t of tokens) {
    if (t.type === 'paragraph' && /\*\*Spend Hold/i.test(t.raw)) {
      foundSpendHeader = true;
      continue;
    }
    if (foundSpendHeader && t.type === 'list') {
      const list = t as Tokens.List;
      return list.items.map(item => item.text.trim());
    }
  }
  return null;
}

export function parseCoterieMoves(repoRoot: string): CoterieMove[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const sections = splitByHeading(allTokens, 3);

  return sections.map(section => {
    const ctx = `Coterie Moves > ${section.name}`;
    const triggerPara = findTriggerParagraph(section.tokens);
    if (!triggerPara) throw new Error(`[${ctx}] No trigger paragraph found`);

    const trigger = extractTrigger(triggerPara);
    if (!trigger) throw new Error(`[${ctx}] No trigger found`);

    const countRule = extractCountRule(section.tokens);
    if (!countRule) throw new Error(`[${ctx}] No count rule paragraph found`);
    const raw = section.tokens.map(t => t.raw).join('');
    const tiers = parseGroupTiers(raw);

    if (tiers.length < 4) {
      throw new Error(`[${ctx}] Expected 4 group tiers, found ${tiers.length}`);
    }

    const holdOptions = extractHoldOptions(section.tokens);

    return {
      name: section.name,
      trigger,
      countRule,
      tiers,
      holdOptions,
    };
  });
}
