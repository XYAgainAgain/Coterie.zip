import { resolve } from 'node:path';
import { type Token } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading } from '../common/tokens.js';
import type { CoterieStat } from '../schemas/coterie-stats.js';

const SOURCE = 'docs/your-coterie/coterie-stats.md';

function extractIntro(allTokens: Token[]): string {
  const parts: string[] = [];
  for (const t of allTokens) {
    if (t.type === 'heading') break;
    if (t.type === 'space') continue;
    parts.push(t.raw);
  }
  return parts.join('\n\n').trim();
}

export function parseCoterieStats(repoRoot: string): { intro: string; stats: CoterieStat[] } {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const intro = extractIntro(allTokens);
  const sections = splitByHeading(allTokens, 2);

  const stats = sections.map(section => {
    const ctx = `Coterie Stats > ${section.name}`;
    const paragraphs: string[] = [];
    let mechanic: string | null = null;
    let changesThrough: string | null = null;

    for (const t of section.tokens) {
      if (t.type !== 'paragraph') continue;
      const raw = t.raw.trim();

      const changesMatch = raw.match(/^\*\*Changes through:\*\*\s*([\s\S]+)/);
      if (changesMatch) {
        changesThrough = changesMatch[1].trim();
        continue;
      }

      const mechanicMatch = raw.match(/^\*\*(Spendable|Bonus)[.:]\*\*\s*([\s\S]+)/);
      if (mechanicMatch) {
        mechanic = raw;
        continue;
      }

      paragraphs.push(raw);
    }

    if (!changesThrough) {
      throw new Error(`[${ctx}] Missing "Changes through" field`);
    }

    return {
      name: section.name,
      description: paragraphs.join('\n\n'),
      mechanic,
      changesThrough,
    };
  });

  return { intro, stats };
}
