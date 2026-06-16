import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import {
  tokenize,
  splitByHeading,
  extractBoldField,
  type Section,
} from '../common/tokens.js';
import type { BasicMove, StandardMove, BlushOfLife } from '../schemas/basic-moves.js';

const SOURCE = 'docs/core-systems/basic-moves.md';

/* Splits at each tier marker: **On a 10+,** or **Advanced: On a 12+,** */
const TIER_SPLIT_RE = /(?=\*\*(?:Advanced: )?On a )/;

/* Extracts the tier label from a chunk that starts with a tier marker */
const TIER_LABEL_RE = /^\*\*(?:Advanced: )?On a (.+?),?\*\*/;

/* Normalize en dashes in tier labels to hyphens */
function normalizeTier(raw: string): string {
  return raw.replace(/–/g, '-');
}

function rawText(tokens: Token[]): string {
  return tokens.map(t => t.raw).join('');
}

/** Find the trigger paragraph's raw text (first paragraph with bold "When"). */
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

function extractRollStat(paraRaw: string): string | null {
  /* "roll +Blood or +Shadow (whichever is higher)" */
  const plusMatch = paraRaw.match(/roll (?:with )?\+(\w+(?:\s+or\s+\+\w+)?(?:\s*\([^)]+\))?)/i);
  if (plusMatch) return `+${plusMatch[1]}`;

  /* "roll with the stat appropriate to your intent" */
  const descMatch = paraRaw.match(/roll (?:with )?the stat (\w+ (?:to|by) [^\n.,:]+)/i);
  if (descMatch) return descMatch[1].trim();

  /* "roll with the same stat as your intended target" */
  const sameMatch = paraRaw.match(/roll (?:with )?the same stat as (?:your )?(.+?)(?:\s+(?:after|before|when)\b|[.,]|$)/i);
  if (sameMatch) return `same stat as ${sameMatch[1].trim()}`;

  return null;
}

/** Extracts a stat-options list that appears between the trigger and the first tier marker. */
function extractStatOptions(tokens: Token[]): string[] | null {
  let foundTrigger = false;
  for (const t of tokens) {
    if (!foundTrigger) {
      if (t.type === 'paragraph' && t.raw.includes('**When ')) foundTrigger = true;
      continue;
    }
    if (t.type === 'paragraph' && /\*\*(?:Advanced: )?On a /.test(t.raw)) break;
    if (t.type === 'list') {
      const list = t as Tokens.List;
      const items = list.items.map(item => item.text.trim());
      if (items.length > 0 && !items[0].startsWith('**')) return items;
    }
  }
  return null;
}

function parseStandardMove(section: Section): StandardMove {
  const raw = rawText(section.tokens);
  const triggerPara = findTriggerParagraph(section.tokens);
  if (!triggerPara) {
    throw new Error(`[Basic Moves > ${section.name}] No trigger paragraph found`);
  }
  const trigger = extractTrigger(triggerPara);
  if (!trigger) {
    throw new Error(`[Basic Moves > ${section.name}] No trigger found`);
  }

  const rollStat = extractRollStat(triggerPara);
  const statOptions = extractStatOptions(section.tokens);
  const chunks = raw.split(TIER_SPLIT_RE);

  const outcomes: { tier: string; content: string }[] = [];
  for (const chunk of chunks) {
    const labelMatch = chunk.match(TIER_LABEL_RE);
    if (!labelMatch) continue;
    const tier = normalizeTier(labelMatch[1]);
    const content = chunk.replace(TIER_LABEL_RE, '').trim();
    outcomes.push({ tier, content });
  }

  if (outcomes.length < 3) {
    throw new Error(
      `[Basic Moves > ${section.name}] Expected >= 3 outcome tiers, found ${outcomes.length}`
    );
  }

  /* Every standard Move must define the 6- failure outcome; three non-failure tiers
     (7-9/10+/12+) would otherwise pass the count check and ship a Move that can't fail. */
  if (!outcomes.some(o => o.tier === '6-')) {
    throw new Error(
      `[Basic Moves > ${section.name}] Missing the 6- failure tier (found: ${outcomes.map(o => o.tier).join(', ')})`
    );
  }

  return {
    type: 'standard',
    name: section.name,
    trigger,
    rollStat,
    statOptions,
    outcomes,
  };
}

function parseBlushOfLife(section: Section): BlushOfLife {
  const raw = rawText(section.tokens);
  const triggerPara = findTriggerParagraph(section.tokens);
  const trigger = triggerPara ? extractTrigger(triggerPara) : null;
  if (!trigger) {
    throw new Error('[Basic Moves > Blush of Life] No trigger found');
  }

  const thresholds: { threshold: string; description: string }[] = [];
  for (const token of section.tokens) {
    if (token.type !== 'list') continue;
    const list = token as Tokens.List;
    for (const item of list.items) {
      const field = extractBoldField(item);
      if (field) {
        thresholds.push({
          threshold: normalizeTier(field.label),
          description: field.value,
        });
      }
    }
    if (thresholds.length > 0) break;
  }

  if (thresholds.length === 0) {
    throw new Error('[Basic Moves > Blush of Life] No Humanity threshold list found');
  }

  let advanced: string | null = null;
  const advMatch = raw.match(/\*\*Advanced: On a 12\+,?\*\*\s*([\s\S]*)$/);
  if (advMatch) {
    advanced = advMatch[1].trim();
  }

  return {
    type: 'blush-of-life',
    name: 'Blush of Life',
    trigger,
    humanityThresholds: thresholds,
    advanced,
  };
}

export function parseBasicMoves(repoRoot: string): BasicMove[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const tokens = tokenize(src);
  const sections = splitByHeading(tokens, 3);

  return sections.map(section => {
    if (section.name === 'Blush of Life') {
      return parseBlushOfLife(section);
    }
    return parseStandardMove(section);
  });
}
