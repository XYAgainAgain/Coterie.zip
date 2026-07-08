import { resolve, relative } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { type Token, type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading, plainText } from '../common/tokens.js';
import type { StMoveCategory, StPromptsData } from '../schemas/storyteller-prompts.js';

const BASIC_MOVES_SOURCE = 'docs/core-systems/basic-moves.md';
const ST_MOVES_DEV_SOURCE = 'dev/game/Coterie-Corebook-Storyteller-Guide.md';
const ST_MOVES_HEADING = 'Storyteller Moves';

/* The first bullet list inside a Move section is its Hold-question list. */
function firstListItems(tokens: Token[]): string[] | null {
  for (const t of tokens) {
    if (t.type === 'list') return (t as Tokens.List).items.map(i => i.text.trim());
  }
  return null;
}

/* Discern Vibes + Catch the Scent question lists from the Basic Moves page. Missing
   sections yield empty arrays with a warning rather than throwing. */
export function parseBasicMovePrompts(md: string): { discernVibes: string[]; catchTheScent: string[] } {
  const sections = splitByHeading(tokenize(md), 3);
  const pick = (name: string): string[] => {
    const section = sections.find(s => s.name === name);
    if (!section) { console.warn(`[Storyteller Prompts] "${name}" section not found in Basic Moves`); return []; }
    const list = firstListItems(section.tokens);
    if (!list) { console.warn(`[Storyteller Prompts] no question list under "${name}"`); return []; }
    return list;
  };
  return { discernVibes: pick('Discern Vibes'), catchTheScent: pick('Catch the Scent') };
}

/* Tokens between the "## Storyteller Moves" H2 and the next H2 (exclusive). */
function sliceH2Section(tokens: Token[], headingText: string): Token[] | null {
  const out: Token[] = [];
  let capturing = false;
  for (const t of tokens) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 2) {
      if (capturing) break;
      capturing = plainText(t).trim() === headingText;
      continue;
    }
    if (capturing) out.push(t);
  }
  return capturing || out.length ? out : null;
}

/* The 8 H3 categories under Storyteller Moves, each a Soft: and a Hard: bullet list.
   Bullet text is kept verbatim (bold markers intact). */
export function parseStorytellerMoves(md: string): StMoveCategory[] {
  const slice = sliceH2Section(tokenize(md), ST_MOVES_HEADING);
  if (!slice) return [];

  const categories: StMoveCategory[] = [];
  let current: StMoveCategory | null = null;
  let mode: 'soft' | 'hard' | null = null;

  for (const t of slice) {
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 3) {
      current = { category: plainText(t).trim(), soft: [], hard: [] };
      categories.push(current);
      mode = null;
      continue;
    }
    if (!current) continue; // intro paragraphs before the first category
    if (t.type === 'paragraph') {
      const label = plainText(t).trim();
      if (label === 'Soft:') mode = 'soft';
      else if (label === 'Hard:') mode = 'hard';
      continue;
    }
    if (t.type === 'list' && mode) {
      const items = (t as Tokens.List).items.map(i => i.text.trim());
      current[mode].push(...items);
    }
  }
  return categories;
}

/* Locate the ST Moves markdown: prefer a published docs/ page (future-proof), fall back
   to the pre-publication dev guide, else null (gitignored/absent in CI → empty output). */
function findMarkdownWithHeading(dir: string, headingText: string): string | null {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return null; }
  for (const name of entries) {
    const full = resolve(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      const nested = findMarkdownWithHeading(full, headingText);
      if (nested) return nested;
    } else if (name.endsWith('.md')) {
      if (new RegExp(`^##\\s+${headingText}\\s*$`, 'm').test(readMarkdown(full))) return full;
    }
  }
  return null;
}

function resolveStMovesSource(repoRoot: string): { md: string; source: string } | null {
  const published = findMarkdownWithHeading(resolve(repoRoot, 'docs'), ST_MOVES_HEADING);
  if (published) return { md: readMarkdown(published), source: relative(repoRoot, published) };
  const devPath = resolve(repoRoot, ST_MOVES_DEV_SOURCE);
  if (existsSync(devPath)) return { md: readMarkdown(devPath), source: ST_MOVES_DEV_SOURCE };
  return null;
}

export function parseStorytellerPrompts(repoRoot: string): StPromptsData {
  const basicMd = readMarkdown(resolve(repoRoot, BASIC_MOVES_SOURCE));
  const { discernVibes, catchTheScent } = parseBasicMovePrompts(basicMd);

  const stSource = resolveStMovesSource(repoRoot);
  let stMoves: StMoveCategory[] = [];
  if (!stSource) {
    console.warn(`[Storyteller Prompts] Storyteller Moves source not found (docs/ or ${ST_MOVES_DEV_SOURCE}); emitting empty stMoves`);
  } else {
    stMoves = parseStorytellerMoves(stSource.md);
    console.log(`[Storyteller Prompts] ST Moves from ${stSource.source}: ${stMoves.length} categories`);
  }

  return { discernVibes, catchTheScent, stMoves };
}
