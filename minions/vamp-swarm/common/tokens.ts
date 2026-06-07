import { type Token, type Tokens, lexer } from 'marked';

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n/;

export interface Section {
  name: string;
  tokens: Token[];
}

export interface BoldField {
  label: string;
  value: string;
}

export function tokenize(md: string): Token[] {
  const body = md.replace(FRONTMATTER_RE, '');
  return lexer(body);
}

export function splitByHeading(tokens: Token[], depth: number): Section[] {
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

  if (sections.length === 0) {
    throw new Error(`No headings at depth ${depth} found`);
  }

  return sections;
}

/**
 * Finds the list whose items contain at least one of the expected
 * bold-label names. Skips narrative lists (e.g., Neonate's decade
 * memories) whose bold labels don't match any expected field.
 */
export function findFieldList(tokens: Token[], expectedLabels: string[]): Tokens.ListItem[] {
  const expected = new Set(expectedLabels);
  for (const token of tokens) {
    if (token.type !== 'list') continue;
    const list = token as Tokens.List;
    if (list.items.length === 0) continue;
    const firstField = extractBoldField(list.items[0]);
    if (firstField && expected.has(firstField.label)) return list.items;
  }
  throw new Error(`No field list found matching labels: ${expectedLabels.join(', ')}`);
}

/**
 * Extracts a **Label:** value pair from a list item's raw text.
 * Returns null if the item doesn't match the bold-label pattern.
 */
export function extractBoldField(item: Tokens.ListItem): BoldField | null {
  const raw = item.text;
  const match = raw.match(/^\*\*(.+?):\*\*\s*([\s\S]*)$/);
  if (!match) return null;
  return { label: match[1].trim(), value: match[2].trim() };
}

/**
 * Extracts a bold-label field from a paragraph's raw text.
 * Used for standalone bold fields like **Embraced:** date range.
 */
export function extractBoldFieldFromParagraph(tokens: Token[]): BoldField | null {
  for (const token of tokens) {
    if (token.type !== 'paragraph') continue;
    const para = token as Tokens.Paragraph;
    const match = para.raw.match(/^\*\*(.+?):\*\*\s*([\s\S]*)$/);
    if (match) {
      return { label: match[1].trim(), value: match[2].trim() };
    }
  }
  return null;
}

/** Collect prose paragraphs preceding a section's field list, joined as markdown. */
export function collectLeadingProse(tokens: Token[], expectedLabels: string[]): string {
  const expected = new Set(expectedLabels);
  const paras: string[] = [];
  for (const token of tokens) {
    if (token.type === 'list') {
      const list = token as Tokens.List;
      const first = list.items.length ? extractBoldField(list.items[0]) : null;
      if (first && expected.has(first.label)) break;
    }
    if (token.type === 'paragraph') {
      paras.push((token as Tokens.Paragraph).raw.trim());
    }
  }
  return paras.join('\n\n').trim();
}

/** Recursively extract plain text from a token, stripping all formatting. */
export function plainText(token: Token): string {
  if ('text' in token && typeof token.text === 'string') {
    if ('tokens' in token && Array.isArray(token.tokens) && token.tokens.length > 0) {
      return token.tokens.map(plainText).join('');
    }
    return token.text;
  }
  if ('tokens' in token && Array.isArray(token.tokens)) {
    return token.tokens.map(plainText).join('');
  }
  return '';
}

/** Collect all fields from a field list into a Map for easy lookup. */
export function collectFields(items: Tokens.ListItem[]): Map<string, string> {
  const fields = new Map<string, string>();
  for (const item of items) {
    const field = extractBoldField(item);
    if (field) {
      fields.set(field.label, field.value);
    }
  }
  return fields;
}

/** Get a required field from a field map, throwing if missing. */
export function requireField(fields: Map<string, string>, label: string, context: string): string {
  const value = fields.get(label);
  if (value === undefined || value === '') {
    throw new Error(`[${context}] Missing required field: "${label}"`);
  }
  return value;
}
