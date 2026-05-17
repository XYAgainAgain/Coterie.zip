import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, type Section } from '../common/tokens.js';
import type { Hunger } from '../schemas/hunger.js';

const SOURCE = 'docs/the-vampiric-condition/hunger.md';

function rawContent(tokens: Token[]): string {
  return tokens.map(t => t.raw).join('').trim();
}

function extractIntro(allTokens: Token[]): string {
  const parts: string[] = [];
  for (const t of allTokens) {
    if (t.type === 'heading') break;
    if (t.type === 'space') continue;
    parts.push(t.raw);
  }
  return parts.join('').trim();
}

function parseTiers(section: Section): { level: string; label: string; description: string }[] {
  const tiers: { level: string; label: string; description: string }[] = [];

  const preH3Tokens: Token[] = [];
  for (const t of section.tokens) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 3) break;
    preH3Tokens.push(t);
  }

  const raw = preH3Tokens.map(t => t.raw).join('').trim();
  const tierBlocks = raw.split(/(?=\*\*\d)/);
  for (const block of tierBlocks) {
    const match = block.match(/^\*\*(.+?):\s*(.+?)\*\*\s*([\s\S]*)/);
    if (!match) continue;
    tiers.push({
      level: match[1].trim(),
      label: match[2].trim(),
      description: match[3].trim(),
    });
  }

  return tiers;
}

export function parseHunger(repoRoot: string): Hunger {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const intro = extractIntro(allTokens);
  const sections = splitByHeading(allTokens, 2);

  const trackingSection = sections.find(s => /Tracking Hunger/i.test(s.name));
  if (!trackingSection) throw new Error('[Hunger] No Tracking Hunger section');
  const tiers = parseTiers(trackingSection);

  const remainingSections = sections
    .filter(s => !/Tracking Hunger/i.test(s.name))
    .map(s => ({
      name: s.name,
      body: rawContent(s.tokens),
    }))
    .filter(s => s.body.length > 0);

  return {
    intro,
    tiers,
    sections: remainingSections,
  };
}
