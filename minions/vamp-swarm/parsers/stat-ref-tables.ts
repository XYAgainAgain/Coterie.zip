import { resolve } from 'node:path';
import { type Tokens } from 'marked';
import { readMarkdown } from '../common/io.js';
import { tokenize, splitByHeading } from '../common/tokens.js';
import type { StatTable } from '../schemas/stat-ref-tables.js';

const SOURCE = 'docs/your-coterie/coterie-stat-reference-tables.md';

export function parseStatRefTables(repoRoot: string): { tables: StatTable[] } {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const allTokens = tokenize(src);
  const sections = splitByHeading(allTokens, 2);

  const tables = sections.map(section => {
    const ctx = `Stat Ref Tables > ${section.name}`;
    const tableToken = section.tokens.find(t => t.type === 'table') as Tokens.Table | undefined;
    if (!tableToken) throw new Error(`[${ctx}] No table found`);

    const rows = tableToken.rows.map(row => {
      if (row.length < 2) throw new Error(`[${ctx}] Row has fewer than 2 cells`);
      return {
        score: row[0].text.trim(),
        description: row[1].text.trim(),
      };
    });

    return {
      name: section.name.replace(/ Table$/, ''),
      rows,
    };
  });

  return { tables };
}
