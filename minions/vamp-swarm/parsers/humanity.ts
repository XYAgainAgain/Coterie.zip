import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, plainText, type Section } from '../common/tokens.js';
import type { Humanity } from '../schemas/humanity.js';

const SOURCE = 'docs/the-vampiric-condition/humanity.md';

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

function parseTiers(section: Section): { range: string; label: string | null; description: string }[] {
  const tiers: { range: string; label: string | null; description: string }[] = [];

  for (const t of section.tokens) {
    if (t.type !== 'paragraph') continue;
    const raw = t.raw.trim();

    const match = raw.match(/^\*\*(.+?)\*\*\s*([\s\S]*)/);
    if (!match) continue;
    const header = match[1].trim();
    const rest = match[2].trim();

    const rangeMatch = header.match(/^([-\d–]+)\s*(?:Humanity\s*)?(?:[:—–]\s*)?(.*)$/);
    if (!rangeMatch) continue;

    const range = rangeMatch[1].replace(/–/g, '-').trim();
    const rawLabel = rangeMatch[2].replace(/:$/, '').trim();
    const label = rawLabel || null;

    const bodyParts: string[] = [];
    if (rest) bodyParts.push(rest);

    tiers.push({
      range,
      label,
      description: bodyParts.join(' ').trim(),
    });
  }

  return tiers;
}

export function parseHumanity(repoRoot: string): Humanity {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const intro = extractIntro(allTokens);
  const sections = splitByHeading(allTokens, 2);

  const trackingSection = sections.find(s => /Tracking Humanity/i.test(s.name));
  if (!trackingSection) throw new Error('[Humanity] No Tracking Humanity section');

  const h3Sections = splitByH3(trackingSection.tokens);
  const lowSection = h3Sections.find(s => /Low Humanity/i.test(s.name));
  if (!lowSection) throw new Error('[Humanity] No Low Humanity Consequences subsection');

  const tiers = parseTiers(lowSection);

  const remainingSections = sections
    .filter(s => !/Tracking Humanity/i.test(s.name))
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

interface SubSection {
  name: string;
  tokens: Token[];
}

function splitByH3(tokens: Token[]): SubSection[] {
  const sections: SubSection[] = [];
  let current: SubSection | null = null;
  for (const t of tokens) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 3) {
      current = { name: plainText(t).trim(), tokens: [] };
      sections.push(current);
    } else if (current) {
      current.tokens.push(t);
    }
  }
  return sections;
}
