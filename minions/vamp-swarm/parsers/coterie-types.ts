import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, type Section } from '../common/tokens.js';
import type { CoterieType } from '../schemas/coterie-types.js';

const SOURCE = 'docs/your-coterie/coterie-types.md';

function parseFeatureList(section: Section, ctx: string): {
  positiveCount: number;
  positiveOptions: string[];
  negativeCount: number;
  negativeOptions: string[];
} {
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

  return { positiveCount, positiveOptions, negativeCount, negativeOptions };
}

function extractDescription(tokens: Token[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    if (t.type === 'paragraph') {
      const raw = t.raw.trim();
      if (raw.startsWith('**Haven Stats:**')) break;
      parts.push(raw);
    }
  }
  return parts.join('\n\n');
}

function extractHavenStats(tokens: Token[]): string | null {
  for (const t of tokens) {
    if (t.type !== 'paragraph') continue;
    const raw = t.raw.trim();
    if (raw.startsWith('**Haven Stats:**')) {
      return raw.replace(/^\*\*Haven Stats:\*\*\s*/, '').replace(/\*\*/g, '').trim();
    }
    if (raw.startsWith('**Haven Stats:')) {
      return raw.replace(/^\*\*Haven Stats:\s*/, '').replace(/\*\*/g, '').trim();
    }
  }
  return null;
}

export function parseCoterieTypes(repoRoot: string): CoterieType[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const sections = splitByHeading(allTokens, 2);

  return sections.map(section => {
    const ctx = `Coterie Types > ${section.name}`;
    const description = extractDescription(section.tokens);
    const havenStats = extractHavenStats(section.tokens);

    if (!havenStats) {
      throw new Error(`[${ctx}] No Haven Stats line found`);
    }

    const havenFeatures = parseFeatureList(section, ctx);

    return {
      name: section.name,
      description,
      havenStats,
      havenFeatures,
    };
  });
}
