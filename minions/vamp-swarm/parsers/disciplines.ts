import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, plainText, type Section } from '../common/tokens.js';
import type { Discipline, Power, DisciplinePerk } from '../schemas/disciplines.js';

const SOURCE_DIR = 'docs/disciplines';
const SKIP_FILES = new Set(['general-rules.md']);

const LEVEL_RE = /^Level (\d)$/;
const PERK_RE = /\(Discipline Perk\)/;
function slugFromFile(filename: string): string {
  return filename.replace(/\.md$/, '');
}

function titleFromSlug(slug: string): string {
  const special: Record<string, string> = {
    'blood-sorcery': 'Blood Sorcery',
    'thin-blood-alchemy': 'Thin-Blood Alchemy',
  };
  if (special[slug]) return special[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function extractIntro(allTokens: Token[]): string | null {
  const parts: string[] = [];
  for (const t of allTokens) {
    if (t.type === 'heading') break;
    if (t.type === 'hr') break;
    parts.push(t.raw);
  }
  const text = parts.join('').trim();
  if (!text || text === '\\[ON THE WAY!]') return null;
  return text;
}

function extractPerk(allTokens: Token[]): DisciplinePerk | null {
  for (let i = 0; i < allTokens.length; i++) {
    const t = allTokens[i];
    if (t.type !== 'heading' || (t as Tokens.Heading).depth !== 3) continue;
    const heading = plainText(t).trim();
    if (!PERK_RE.test(heading)) continue;

    const name = heading.replace(/\s*\(Discipline Perk\)\s*/, '').trim();

    const bodyParts: string[] = [];
    for (let j = i + 1; j < allTokens.length; j++) {
      const next = allTokens[j];
      if (next.type === 'heading' || next.type === 'hr') break;
      bodyParts.push(next.raw);
    }
    const body = bodyParts.join('').trim();
    if (!body) return null;
    return { name, body };
  }
  return null;
}

function extractTags(heading: string): string[] {
  const tags: string[] = [];
  for (const m of heading.matchAll(/\(([^)]+)\)/g)) {
    const tag = m[1].trim();
    if (tag !== 'Discipline Perk') {
      tags.push(tag);
    }
  }
  return tags;
}

function parsePowersFromLevel(levelSection: Section, level: number): Power[] {
  const powers: Power[] = [];
  let currentName: string | null = null;
  let currentTags: string[] = [];
  let bodyParts: string[] = [];

  function flush() {
    if (currentName) {
      const body = bodyParts.join('').trim();
      if (body) {
        powers.push({ name: currentName, level, tags: currentTags, body });
      }
    }
    currentName = null;
    currentTags = [];
    bodyParts = [];
  }

  for (const t of levelSection.tokens) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 3) {
      flush();
      const heading = plainText(t).trim();
      currentName = heading.replace(/\s*\([^)]*\)\s*/g, '').trim();
      currentTags = extractTags(heading);
    } else if (currentName) {
      if (t.type === 'hr') continue;
      bodyParts.push(t.raw);
    }
  }
  flush();

  return powers;
}

function splitByHeadingSafe(tokens: Token[], depth: number): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const token of tokens) {
    if (token.type === 'heading' && (token as Tokens.Heading).depth === depth) {
      current = { name: plainText(token).trim(), tokens: [] };
      sections.push(current);
    } else if (current) {
      current.tokens.push(token);
    }
  }
  return sections;
}

function determineStatus(perk: DisciplinePerk | null, powers: Power[]): 'complete' | 'partial' | 'stub' {
  if (!perk && powers.length === 0) return 'stub';
  if (perk && powers.length >= 5) return 'complete';
  return 'partial';
}

function parseDiscipline(filePath: string, slug: string): Discipline {
  const src = readMarkdown(filePath);
  const allTokens = tokenize(src);

  const name = titleFromSlug(slug);
  const intro = extractIntro(allTokens);
  const perk = extractPerk(allTokens);

  const h2Sections = splitByHeadingSafe(allTokens, 2);
  const powers: Power[] = [];

  for (const section of h2Sections) {
    const levelMatch = section.name.match(LEVEL_RE);
    if (!levelMatch) continue;
    const level = parseInt(levelMatch[1], 10);
    powers.push(...parsePowersFromLevel(section, level));
  }

  return {
    name,
    slug,
    intro,
    perk,
    powers,
    status: determineStatus(perk, powers),
  };
}

export function parseDisciplines(repoRoot: string): Discipline[] {
  const dir = resolve(repoRoot, SOURCE_DIR);
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.md') && !SKIP_FILES.has(f))
    .sort();

  return files.map(f => {
    const slug = slugFromFile(f);
    try {
      return parseDiscipline(resolve(dir, f), slug);
    } catch (err) {
      throw new Error(`[Disciplines > ${slug}] ${err instanceof Error ? err.message : err}`);
    }
  });
}
