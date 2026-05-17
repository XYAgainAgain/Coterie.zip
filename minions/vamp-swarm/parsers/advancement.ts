import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, plainText, type Section } from '../common/tokens.js';
import type { Advancement } from '../schemas/advancement.js';

const SOURCE = 'docs/your-kindred/advancement.md';

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

function parseXPSources(section: Section): { name: string; maxPerSession: string; description: string }[] {
  const sources: { name: string; maxPerSession: string; description: string }[] = [];

  for (const t of section.tokens) {
    if (t.type !== 'list') continue;
    const list = t as Tokens.List;
    if (!list.ordered) continue;
    for (const item of list.items) {
      const raw = item.text;
      const nameMatch = raw.match(/^\*\*(.+?):\*\*\s*([\s\S]+)/);
      if (!nameMatch) continue;

      const name = nameMatch[1].trim();
      const rest = nameMatch[2].trim();

      const fullRaw = item.raw || raw;
      const maxMatch = fullRaw.match(/Maximum from this source:\s*\*\*(.+?)\.?\*\*/);
      const maxPerSession = maxMatch ? maxMatch[1].trim() : 'Varies';

      sources.push({
        name,
        maxPerSession,
        description: rest.replace(/\n\s*-\s*\*Maximum.*$/s, '').trim(),
      });
    }
    if (sources.length > 0) break;
  }

  return sources;
}

function parseXPCosts(section: Section): { name: string; cost: string; description: string }[] {
  const costs: { name: string; cost: string; description: string }[] = [];

  const h3Sections = splitByH3(section.tokens);
  for (const sub of h3Sections) {
    const bodyRaw = rawContent(sub.tokens);
    const costMatch = bodyRaw.match(/\*\*XP Cost:\*\*\s*(.+?)(?:\s*\||\n)/);
    const cost = costMatch ? costMatch[1].trim() : 'Varies';

    costs.push({
      name: sub.name,
      cost,
      description: bodyRaw,
    });
  }

  return costs;
}

export function parseAdvancement(repoRoot: string): Advancement {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const sections = splitByHeading(allTokens, 2);

  const growingSection = sections.find(s => /Growing in Power/i.test(s.name));
  const intro = growingSection ? rawContent(growingSection.tokens) : extractIntro(allTokens);

  const gettingSection = sections.find(s => /Getting Experience/i.test(s.name));
  if (!gettingSection) throw new Error('[Advancement] No Getting Experience section');
  const xpSources = parseXPSources(gettingSection);

  const spendingSection = sections.find(s => /What Experience Gets You/i.test(s.name));
  if (!spendingSection) throw new Error('[Advancement] No What Experience Gets You section');
  const xpCosts = parseXPCosts(spendingSection);

  const otherSections = sections
    .filter(s => !/Getting Experience|What Experience|Growing in Power/i.test(s.name))
    .map(s => ({
      name: s.name,
      body: rawContent(s.tokens),
    }))
    .filter(s => s.body.length > 0);

  return {
    intro,
    xpSources,
    xpCosts,
    sections: otherSections,
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
