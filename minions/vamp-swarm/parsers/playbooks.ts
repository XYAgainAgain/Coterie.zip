import { resolve } from 'node:path';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import {
  tokenize,
  splitByHeading,
  plainText,
  extractBoldField,
  type Section,
} from '../common/tokens.js';
import type { Playbook, Perk, Archetype } from '../schemas/playbooks.js';

const CLAN_FILES = [
  'banu-haqim', 'brujah', 'gangrel', 'hecata', 'lasombra',
  'malkavian', 'nosferatu', 'the-ministry', 'ravnos', 'salubri',
  'toreador', 'tremere', 'tzimisce', 'ventrue',
];

const CLANLESS_FILES = [
  'baali', 'caitiff', 'daughter-of-cacophony', 'devorari',
  'gargoyle', 'ghoul', 'osirian', 'thin-blood',
];

const SOURCE_DIR = 'docs/your-kindred';

function findSection(sections: Section[], namePattern: RegExp, ctx: string): Section {
  const found = sections.find(s => namePattern.test(s.name));
  if (!found) throw new Error(`[${ctx}] No section matching ${namePattern}`);
  return found;
}

function rawContent(tokens: Token[]): string {
  return tokens.map(t => t.raw).join('').trim();
}

function extractTagline(tokens: Token[]): string | null {
  for (const t of tokens) {
    if (t.type === 'paragraph') {
      const para = t as Tokens.Paragraph;
      if (para.raw.startsWith('*') && !para.raw.startsWith('**')) {
        return plainText(para).trim();
      }
    }
  }
  return null;
}

function extractBaneName(heading: string): string {
  return heading.replace(/^Bane:\s*/, '');
}

function extractCompulsionName(heading: string): string {
  return heading.replace(/^Compulsion:\s*/, '');
}

function parsePerks(section: Section, ctx: string): Perk[] {
  const perks: Perk[] = [];

  for (const t of section.tokens) {
    if (t.type !== 'paragraph') continue;
    const raw = t.raw.trim();
    const match = raw.match(/^\*\*\*(.+?):\*\*\*\s+([\s\S]+)$/);
    if (!match) continue;
    perks.push({
      name: match[1].trim(),
      description: match[2].trim(),
    });
  }

  if (perks.length === 0) {
    throw new Error(`[${ctx}] No Perks found`);
  }
  return perks;
}

function parseXpTriggers(section: Section, ctx: string): { triggers: string[]; extra: string | null } {
  const triggers: string[] = [];
  let extra: string | null = null;

  for (const t of section.tokens) {
    if (t.type === 'list') {
      const list = t as Tokens.List;
      for (const item of list.items) {
        triggers.push(item.text.trim());
      }
    }
  }

  const h3Sections = splitByH3(section.tokens);
  if (h3Sections.length > 0) {
    extra = h3Sections.map(s => `### ${s.name}\n\n${rawContent(s.tokens)}`).join('\n\n');
  }

  if (triggers.length === 0) {
    throw new Error(`[${ctx}] No XP triggers found`);
  }
  return { triggers, extra };
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

function parseArchetypes(section: Section, ctx: string): { archetypes: Archetype[]; customSpread: string } {
  const archetypes: Archetype[] = [];
  let customSpread = '';

  for (const t of section.tokens) {
    if (t.type !== 'list') continue;
    const list = t as Tokens.List;
    for (const item of list.items) {
      const raw = item.text;

      const customMatch = raw.match(/\*\*Custom Archetype:\*\*.*?distributing these stats:\s*\*\*(.+?)\*\*/);
      if (customMatch) {
        customSpread = customMatch[1].trim();
        continue;
      }

      const match = raw.match(/^\*\*(.+?):\*\*\s*\*(.+?)\*\s*\n\s*[-–]\s*(.*)/s);
      if (match) {
        archetypes.push({
          name: match[1].trim(),
          tagline: match[2].trim(),
          stats: match[3].trim(),
        });
      }
    }
  }

  if (archetypes.length < 3) {
    throw new Error(`[${ctx}] Expected >= 3 Archetypes, found ${archetypes.length}`);
  }
  if (!customSpread) {
    throw new Error(`[${ctx}] No Custom Archetype stat spread found`);
  }

  return { archetypes, customSpread };
}

function parsePlaybook(fileStem: string, category: 'clan' | 'clanless', repoRoot: string): Playbook {
  const path = resolve(repoRoot, SOURCE_DIR, `${fileStem}.md`);
  const src = readMarkdown(path);
  const allTokens = tokenize(src);
  const ctx = `Playbooks > ${fileStem}`;

  const tagline = extractTagline(allTokens);
  if (!tagline) throw new Error(`[${ctx}] No italic tagline found`);

  const sections = splitByHeading(allTokens, 2);

  const whatAreYou = findSection(sections, /^What Are You/, ctx);
  const disciplineSection = findSection(sections, /^Disciplines?$/, ctx);
  const baneSection = findSection(sections, /^Bane:/, ctx);
  const compulsionSection = findSection(sections, /^Compulsion:/, ctx);
  const perksSection = findSection(sections, /Perks$/, ctx);
  const xpSection = findSection(sections, /Experience$/, ctx);
  const archetypeSection = findSection(sections, /^Archetypes$/, ctx);

  const baneName = extractBaneName(baneSection.name);
  const compulsionName = extractCompulsionName(compulsionSection.name);

  const perks = parsePerks(perksSection, ctx);
  const { triggers, extra } = parseXpTriggers(xpSection, ctx);
  const { archetypes, customSpread } = parseArchetypes(archetypeSection, ctx);

  return {
    name: fileStemToName(fileStem),
    category,
    tagline,
    whatAreYou: rawContent(whatAreYou.tokens),
    disciplines: rawContent(disciplineSection.tokens),
    baneName,
    baneDescription: rawContent(baneSection.tokens),
    compulsionName,
    compulsionDescription: rawContent(compulsionSection.tokens),
    perks,
    xpTriggers: triggers,
    xpExtra: extra,
    archetypes,
    customStatSpread: customSpread,
  };
}

function fileStemToName(stem: string): string {
  const titleMap: Record<string, string> = {
    'banu-haqim': 'Banu Haqim',
    'the-ministry': 'The Ministry',
    'daughter-of-cacophony': 'Daughter of Cacophony',
    'thin-blood': 'Thin-Blood',
  };
  if (titleMap[stem]) return titleMap[stem];
  return stem.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function parsePlaybooks(repoRoot: string): Playbook[] {
  const results: Playbook[] = [];

  for (const stem of CLAN_FILES) {
    const ctx = `Playbooks > ${stem}`;
    try {
      results.push(parsePlaybook(stem, 'clan', repoRoot));
    } catch (err) {
      throw new Error(`[${ctx}] ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const stem of CLANLESS_FILES) {
    const ctx = `Playbooks > ${stem}`;
    try {
      results.push(parsePlaybook(stem, 'clanless', repoRoot));
    } catch (err) {
      throw new Error(`[${ctx}] ${err instanceof Error ? err.message : err}`);
    }
  }

  return results;
}
