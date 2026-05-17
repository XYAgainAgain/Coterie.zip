import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading } from '../common/tokens.js';
import type { HpTier, EquipTable } from '../schemas/harm-healing.js';

const SOURCE = 'docs/core-systems/harm-healing.md';

function extractIntro(allTokens: Token[]): string {
  const parts: string[] = [];
  for (const t of allTokens) {
    if (t.type === 'heading') break;
    if (t.type === 'space') continue;
    parts.push(t.raw);
  }
  return parts.join('\n\n').trim();
}

function extractHpTiers(tokens: Token[]): HpTier[] {
  for (const t of tokens) {
    if (t.type !== 'list') continue;
    const list = t as Tokens.List;
    const tiers: HpTier[] = [];
    for (const item of list.items) {
      const match = item.text.match(/\*\*BP\s+([\d–-]+):\*\*\s*(\d+)\s*HP/);
      if (!match) continue;
      tiers.push({
        bpRange: match[1],
        hp: parseInt(match[2], 10),
      });
    }
    if (tiers.length > 0) return tiers;
  }
  return [];
}

function extractEquipTables(sections: { name: string; tokens: Token[] }[]): EquipTable[] {
  const tables: EquipTable[] = [];
  for (const section of sections) {
    for (const t of section.tokens) {
      if (t.type !== 'table') continue;
      const table = t as Tokens.Table;
      const rows = table.rows.map(row => ({
        item: row[0].text.trim(),
        value: row[1].text.trim(),
      }));
      const rawName = table.header[0].text.trim();
      const name = rawName.charAt(0) + rawName.slice(1).toLowerCase();
      tables.push({ name, rows });
    }
  }
  return tables;
}

export function parseHarmHealing(repoRoot: string): {
  intro: string;
  hpTiers: HpTier[];
  sections: { name: string; body: string }[];
  equipTables: EquipTable[];
} {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const intro = extractIntro(allTokens);
  const h2Sections = splitByHeading(allTokens, 2);

  const harmTrackSection = h2Sections.find(s => s.name === 'The Harm Track');
  const hpTiers = harmTrackSection ? extractHpTiers(harmTrackSection.tokens) : [];
  if (hpTiers.length === 0) throw new Error('No HP tiers found in The Harm Track section');

  const equipTables = extractEquipTables(h2Sections);

  const sections = h2Sections.map(section => ({
    name: section.name,
    body: section.tokens.map(t => t.raw).join('').trim(),
  }));

  return { intro, hpTiers, sections, equipTables };
}
