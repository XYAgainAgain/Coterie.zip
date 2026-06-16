import { resolve } from 'node:path';
import { type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, plainText } from '../common/tokens.js';
import type { Tag } from '../schemas/tags.js';

const SOURCE = 'docs/storyteller/items-and-tags.md';
const TABLE_HEADING = 'Master Tag Table';

/* The bold-tag-table-column cleaner rule wraps each TAG cell in **...**, and the
   appendix extractor escapes the one [Trespasser] sentinel to \[. Strip both so
   the stored name is the bare, canonical tag (e.g. [Trespasser]-Warded). */
function stripTagName(raw: string): string {
  return raw.trim().replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^\\/, '').trim();
}

export function parseTags(repoRoot: string): Tag[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const tokens = tokenize(src);

  /* Anchor on the heading text, not its depth, so a future heading-level shift
     in the page doesn't silently break parsing. */
  let seenHeading = false;
  let table: Tokens.Table | undefined;
  for (const token of tokens) {
    if (token.type === 'heading' && plainText(token).trim() === TABLE_HEADING) {
      seenHeading = true;
    } else if (seenHeading && token.type === 'table') {
      table = token as Tokens.Table;
      break;
    }
  }
  if (!table) throw new Error(`[Tags] No table found under "${TABLE_HEADING}" in ${SOURCE}`);

  return table.rows.map((row, i) => {
    const ctx = `Tags > row ${i + 1}`;
    if (row.length < 3) throw new Error(`[${ctx}] Expected 3 cells, got ${row.length}`);

    const name = stripTagName(row[0].text);
    if (!name) throw new Error(`[${ctx}] Empty tag name`);

    const categories = row[1].text.split(',').map(c => c.trim()).filter(Boolean);
    if (categories.length === 0) throw new Error(`[${ctx}] No categories for "${name}"`);

    const effect = row[2].text.trim();
    if (!effect) throw new Error(`[${ctx}] Empty effect for "${name}"`);

    return { name, categories, effect };
  });
}
