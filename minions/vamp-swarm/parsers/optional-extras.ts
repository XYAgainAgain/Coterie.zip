import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading } from '../common/tokens.js';
import type { ClanBaneVariant, FolkloricBane } from '../schemas/optional-extras.js';

const SOURCE = 'docs/your-kindred/optional-extras.md';

function extractSectionIntro(tokens: Token[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    if (t.type === 'table') break;
    if (t.type === 'space') continue;
    if (t.type === 'paragraph') parts.push(t.raw.trim());
  }
  return parts.join('\n\n');
}

function parseClanBaneTable(tokens: Token[]): ClanBaneVariant[] {
  const table = tokens.find(t => t.type === 'table') as Tokens.Table | undefined;
  if (!table) throw new Error('No Clan Bane Variants table found');

  return table.rows.map(row => {
    if (row.length < 3) throw new Error('Clan Bane Variant row has fewer than 3 cells');
    const clanRaw = row[0].text.trim();
    const clan = clanRaw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    return {
      clan,
      baneName: row[1].text.replace(/^\*|\*$/g, '').trim(),
      consequences: row[2].text.trim(),
    };
  });
}

function parseFolkloricBaneTable(tokens: Token[]): FolkloricBane[] {
  const table = tokens.find(t => t.type === 'table') as Tokens.Table | undefined;
  if (!table) throw new Error('No Folkloric Banes table found');

  return table.rows.map(row => {
    if (row.length < 3) throw new Error('Folkloric Bane row has fewer than 3 cells');
    return {
      baneName: row[0].text.replace(/^\*|\*$/g, '').trim(),
      consequences: row[1].text.trim(),
      xpGain: row[2].text.trim(),
    };
  });
}

export function parseOptionalExtras(repoRoot: string): {
  clanBaneVariantsIntro: string;
  clanBaneVariants: ClanBaneVariant[];
  folkloricBanesIntro: string;
  folkloricBanes: FolkloricBane[];
} {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const sections = splitByHeading(allTokens, 2);

  const clanSection = sections.find(s => s.name === 'Clan Bane Variants');
  if (!clanSection) throw new Error('No "Clan Bane Variants" H2 section found');

  const folkSection = sections.find(s => s.name === 'Folkloric Banes');
  if (!folkSection) throw new Error('No "Folkloric Banes" H2 section found');

  return {
    clanBaneVariantsIntro: extractSectionIntro(clanSection.tokens),
    clanBaneVariants: parseClanBaneTable(clanSection.tokens),
    folkloricBanesIntro: extractSectionIntro(folkSection.tokens),
    folkloricBanes: parseFolkloricBaneTable(folkSection.tokens),
  };
}
