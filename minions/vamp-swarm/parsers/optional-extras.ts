import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading } from '../common/tokens.js';
import type { ClanBaneVariant, FolkloricBane, Merit, Flaw } from '../schemas/optional-extras.js';

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

function stripItalics(text: string): string {
  return text.replace(/^\*+|\*+$/g, '').trim();
}

function findTable(tokens: Token[]): Tokens.Table | null {
  return (tokens.find(t => t.type === 'table') as Tokens.Table | undefined) ?? null;
}

function parseMeritTable(tokens: Token[], category: string): Merit[] {
  const table = findTable(tokens);
  if (!table) return [];

  return table.rows.map(row => {
    if (row.length < 4) throw new Error(`Merit row in "${category}" has fewer than 4 cells`);
    return {
      name: stripItalics(row[0].text),
      category,
      limit: row[1].text.trim(),
      description: row[2].text.trim(),
      xpCost: row[3].text.trim(),
    };
  });
}

function parseFlawTable(tokens: Token[], category: string): Flaw[] {
  const table = findTable(tokens);
  if (!table) return [];

  return table.rows.map(row => {
    if (row.length < 4) throw new Error(`Flaw row in "${category}" has fewer than 4 cells`);
    return {
      name: stripItalics(row[0].text),
      category,
      limit: row[1].text.trim(),
      description: row[2].text.trim(),
      xpGain: row[3].text.trim(),
    };
  });
}

function parseMeritsAndFlaws(tokens: Token[]): { merits: Merit[]; flaws: Flaw[] } {
  const merits: Merit[] = [];
  const flaws: Flaw[] = [];

  let categories: { name: string; tokens: Token[] }[];
  try {
    categories = splitByHeading(tokens, 3);
  } catch {
    return { merits, flaws };
  }

  for (const cat of categories) {
    if (cat.name === 'Dark Bargains') {
      flaws.push(...parseFlawTable(cat.tokens, cat.name));
      continue;
    }

    if (cat.name === 'Low-Potency Playbooks') {
      let playbooks: { name: string; tokens: Token[] }[];
      try { playbooks = splitByHeading(cat.tokens, 4); } catch { continue; }

      for (const pb of playbooks) {
        const subCat = `${cat.name} (${stripItalics(pb.name)})`;
        let subSections: { name: string; tokens: Token[] }[];
        try { subSections = splitByHeading(pb.tokens, 5); } catch { continue; }

        for (const sub of subSections) {
          const heading = stripItalics(sub.name).toLowerCase();
          if (heading === 'merits') merits.push(...parseMeritTable(sub.tokens, subCat));
          else if (heading === 'flaws') flaws.push(...parseFlawTable(sub.tokens, subCat));
        }
      }
      continue;
    }

    /* Standard categories: H4 *Merits* and/or H4 *Flaws* */
    let subSections: { name: string; tokens: Token[] }[];
    try { subSections = splitByHeading(cat.tokens, 4); } catch { continue; }

    for (const sub of subSections) {
      const heading = stripItalics(sub.name).toLowerCase();
      if (heading === 'merits') merits.push(...parseMeritTable(sub.tokens, cat.name));
      else if (heading === 'flaws') flaws.push(...parseFlawTable(sub.tokens, cat.name));
    }
  }

  return { merits, flaws };
}

export function parseOptionalExtras(repoRoot: string): {
  clanBaneVariantsIntro: string;
  clanBaneVariants: ClanBaneVariant[];
  folkloricBanesIntro: string;
  folkloricBanes: FolkloricBane[];
  merits: Merit[];
  flaws: Flaw[];
} {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const sections = splitByHeading(allTokens, 2);

  const clanSection = sections.find(s => s.name === 'Clan Bane Variants');
  if (!clanSection) throw new Error('No "Clan Bane Variants" H2 section found');

  const folkSection = sections.find(s => s.name === 'Folkloric Banes');
  if (!folkSection) throw new Error('No "Folkloric Banes" H2 section found');

  const mfSection = sections.find(s => s.name.startsWith('Merits'));
  const { merits, flaws } = mfSection
    ? parseMeritsAndFlaws(mfSection.tokens)
    : { merits: [], flaws: [] };

  return {
    clanBaneVariantsIntro: extractSectionIntro(clanSection.tokens),
    clanBaneVariants: parseClanBaneTable(clanSection.tokens),
    folkloricBanesIntro: extractSectionIntro(folkSection.tokens),
    folkloricBanes: parseFolkloricBaneTable(folkSection.tokens),
    merits,
    flaws,
  };
}
