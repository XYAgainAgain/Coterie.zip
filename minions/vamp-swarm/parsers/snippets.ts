import { resolve } from 'node:path';
import { readMarkdown } from '../common/io.js';
import type { SnippetEntry } from '../schemas/snippets.js';

/* Reads minions/vamp-swarm/snippets.md, not from docs/ */
const SOURCE = 'minions/vamp-swarm/snippets.md';

const H2_RE = /^## (.+)$/;
const H3_RE = /^### (.+)$/;

export function parseSnippets(repoRoot: string): SnippetEntry[] {
  const src = readMarkdown(resolve(repoRoot, SOURCE));
  const lines = src.split('\n');
  const entries: SnippetEntry[] = [];

  let currentType = '';
  let currentName = '';
  let bodyLines: string[] = [];

  function flush() {
    if (!currentType || !currentName) return;
    const snippet = bodyLines.join('\n').trim();
    if (!snippet) return;
    entries.push({ type: currentType, name: currentName, snippet });
    bodyLines = [];
  }

  for (const line of lines) {
    const h2 = line.match(H2_RE);
    if (h2) {
      flush();
      currentType = h2[1].trim().toLowerCase();
      currentName = '';
      bodyLines = [];
      continue;
    }

    const h3 = line.match(H3_RE);
    if (h3) {
      flush();
      currentName = h3[1].trim();
      bodyLines = [];
      continue;
    }

    if (currentType && currentName) {
      bodyLines.push(line);
    } else if (currentType && !currentName && line.trim()) {
      throw new Error(`[Snippets] Body content under "## ${currentType}" without an ### H3 name`);
    }
  }

  flush();
  return entries;
}
