import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, type Section } from '../common/tokens.js';
import type { CoterieType } from '../schemas/coterie-types.js';

const SOURCE = 'docs/your-coterie/coterie-types.md';

type HavenFeatures = CoterieType['havenFeatures'];

// Uncategorizable reuses the **Pick N X:** skeleton but fills it with a
// freeform sentence, so it's branched separately to dodge the comma splitter.
const UNCATEGORIZABLE = 'The Uncategorizable';

function parseFeatureList(section: Section, ctx: string): HavenFeatures {
  let positiveCount = 0;
  let positiveOptions: string[] = [];
  let negativeCount = 0;
  let negativeOptions: string[] = [];

  for (const t of section.tokens) {
    if (t.type !== 'list') continue;
    const list = t as Tokens.List;
    for (const item of list.items) {
      const raw = item.text.trim();

      const posMatch = raw.match(/^\*\*Pick (\d+) Positive:\*\*\s*\*(.*)\*/s);
      if (posMatch) {
        positiveCount = parseInt(posMatch[1], 10);
        positiveOptions = posMatch[2].split(',').map(s => s.trim()).filter(Boolean);
        continue;
      }

      const negMatch = raw.match(/^\*\*Pick (\d+) Negative:\*\*\s*\*(.*)\*/s);
      if (negMatch) {
        negativeCount = parseInt(negMatch[1], 10);
        negativeOptions = negMatch[2].split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }

  if (positiveOptions.length === 0) {
    throw new Error(`[${ctx}] No positive Haven Features found`);
  }
  if (negativeOptions.length === 0) {
    throw new Error(`[${ctx}] No negative Haven Features found`);
  }

  return {
    positiveCount,
    positiveOptions,
    negativeCount,
    negativeOptions,
    aggregate: false,
    positiveNote: null,
    negativeNote: null,
  };
}

// Option pools left empty here; backfilled from every other type post-parse.
function parseAggregateFeatures(section: Section, ctx: string): HavenFeatures {
  let positiveCount = 0;
  let negativeCount = 0;
  let positiveNote: string | null = null;
  let negativeNote: string | null = null;

  for (const t of section.tokens) {
    if (t.type !== 'list') continue;
    for (const item of (t as Tokens.List).items) {
      const raw = item.text.trim();

      const posMatch = raw.match(/^\*\*Pick (\d+) Positive:\*\*\s*\*?(.+?)\*?$/s);
      if (posMatch) {
        positiveCount = parseInt(posMatch[1], 10);
        positiveNote = posMatch[2].trim();
        continue;
      }

      const negMatch = raw.match(/^\*\*Pick (\d+) Negative:\*\*\s*\*?(.+?)\*?$/s);
      if (negMatch) {
        negativeCount = parseInt(negMatch[1], 10);
        negativeNote = negMatch[2].trim();
      }
    }
  }

  if (!positiveNote || !negativeNote) {
    throw new Error(`[${ctx}] Aggregate Haven Feature instructions not found`);
  }

  return {
    positiveCount,
    negativeCount,
    positiveOptions: [],
    negativeOptions: [],
    aggregate: true,
    positiveNote,
    negativeNote,
  };
}

// Dedupe and alphabetize for a predictable dropdown order.
function dedupe(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function extractDescription(tokens: Token[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    if (t.type === 'paragraph') {
      const raw = t.raw.trim();
      if (raw.startsWith('**Coterie Stats:**') || raw.startsWith('**Coterie Stats:')) break;
      parts.push(raw);
    }
  }
  return parts.join('\n\n');
}

function extractCoterieStats(tokens: Token[]): string | null {
  for (const t of tokens) {
    if (t.type !== 'paragraph') continue;
    const raw = t.raw.trim();
    if (raw.startsWith('**Coterie Stats:**')) {
      return raw.replace(/^\*\*Coterie Stats:\*\*\s*/, '').replace(/\*\*/g, '').trim();
    }
    if (raw.startsWith('**Coterie Stats:')) {
      return raw.replace(/^\*\*Coterie Stats:\s*/, '').replace(/\*\*/g, '').trim();
    }
  }
  return null;
}

export function parseCoterieTypes(repoRoot: string): CoterieType[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const sections = splitByHeading(allTokens, 2);

  const entries = sections.map(section => {
    const ctx = `Coterie Types > ${section.name}`;
    const description = extractDescription(section.tokens);
    const coterieStats = extractCoterieStats(section.tokens);

    if (!coterieStats) {
      throw new Error(`[${ctx}] No Coterie Stats line found`);
    }

    const havenFeatures = section.name === UNCATEGORIZABLE
      ? parseAggregateFeatures(section, ctx)
      : parseFeatureList(section, ctx);

    return {
      name: section.name,
      description,
      coterieStats,
      havenFeatures,
    };
  });

  const aggregate = entries.find(e => e.havenFeatures.aggregate);
  if (aggregate) {
    const others = entries.filter(e => e !== aggregate);
    aggregate.havenFeatures.positiveOptions = dedupe(
      others.flatMap(e => e.havenFeatures.positiveOptions),
    );
    aggregate.havenFeatures.negativeOptions = dedupe(
      others.flatMap(e => e.havenFeatures.negativeOptions),
    );
  }

  return entries;
}
