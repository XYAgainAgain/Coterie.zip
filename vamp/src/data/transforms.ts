import { marked, type Token } from 'marked';
import { STAT_NAMES } from './types';
import type { StatName, Prerequisite } from './types';

const LINK_RE = /\[.*?\]\(\.\.\/disciplines\/([\w-]+)\.md\)/g;

export function parseDisciplineChoices(raw: string): string[] {
  const slugs: string[] = [];
  for (const match of raw.matchAll(LINK_RE)) {
    slugs.push(match[1]);
  }
  return slugs;
}

const STAT_PIECE_RE = /(\w+)\s*([+\-−])(\d+)/;

export function parseStatString(raw: string): Record<StatName, number> {
  const result = { Blood: 0, Shadow: 0, Resolve: 0, Demeanor: 0, Wits: 0 } as Record<StatName, number>;
  for (const piece of raw.split('|')) {
    const m = piece.trim().match(STAT_PIECE_RE);
    if (!m) continue;
    const name = m[1] as StatName;
    if (!STAT_NAMES.includes(name)) continue;
    const sign = m[2] === '+' ? 1 : -1;
    result[name] = sign * parseInt(m[3], 10);
  }
  return result;
}

const PREREQ_RE = /\*\(Requires:\s*(.+?)\)\*/g;

export function parsePrerequisites(body: string): Prerequisite[] {
  const prereqs: Prerequisite[] = [];
  for (const match of body.matchAll(PREREQ_RE)) {
    const text = match[1].trim();
    if (text.toLowerCase().endsWith('access')) {
      prereqs.push({ type: 'discipline', name: text.replace(/\s+access$/i, '').trim() });
    } else {
      prereqs.push({ type: 'power', name: text.replace(/\*+/g, '').trim() });
    }
  }
  return prereqs;
}

export function parseHuntingStat(raw: string): StatName | null {
  const cleaned = raw.replace(/^\+/, '').trim();
  if (STAT_NAMES.includes(cleaned as StatName)) return cleaned as StatName;
  return null;
}

const RELATIVE_LINK_RE = /\(\.\.\/([\w-]+)\/([\w-]+)\.md(#[\w-]*)?\)/g;
const BARE_LINK_RE = /\]\(([\w-]+)\.md(#[\w-]*)?\)/g;
const IMG_PATH_RE = /\(\.\.\/assets\//g;
const ATTR_LIST_RE = /\{\s*\.[a-zA-Z0-9_-]+(?:\s+\.[a-zA-Z0-9_-]+)*\s*\}/g;

/* Bare-filename links lack a section prefix; map known slugs to their section */
const SLUG_TO_SECTION: Record<string, string> = {
  'optional-extras': 'your-kindred',
  'creating-your-character': 'your-kindred',
  'predator-types': 'your-kindred',
  'advancement': 'your-kindred',
  'coterie-stat-reference-tables': 'your-coterie',
  'creating-your-coterie': 'your-coterie',
  'coterie-moves': 'your-coterie',
  'coterie-stats': 'your-coterie',
  'coterie-types': 'your-coterie',
  'general-rules': 'disciplines',
};

export function rewriteMarkdownLinks(md: string): string {
  return md
    .replace(RELATIVE_LINK_RE, (_m, section: string, slug: string, frag?: string) =>
      `(https://coterie.zip/${section}/${slug}/${frag ?? ''})`,
    )
    .replace(BARE_LINK_RE, (_m, slug: string, frag?: string) => {
      const section = SLUG_TO_SECTION[slug];
      if (!section) return _m;
      return `](https://coterie.zip/${section}/${slug}/${frag ?? ''})`;
    })
    .replace(IMG_PATH_RE, '(https://coterie.zip/assets/')
    .replace(ATTR_LIST_RE, '');
}

const TIER_RE = /<strong>(?:Advanced:\s*)?On a (\d+[^<]*?),?<\/strong>/g;

export function colorTierMarkers(html: string): string {
  return html.replace(TIER_RE, (match, tier: string) => {
    let cls = '';
    if (tier.startsWith('12')) cls = 'tier-inline-12';
    else if (tier.startsWith('10')) cls = 'tier-inline-10';
    else if (tier.startsWith('7')) cls = 'tier-inline-7';
    else if (tier.startsWith('6')) cls = 'tier-inline-6';
    if (!cls) return match;
    const inner = match.replace(/<\/?strong>/g, '');
    return `<strong class="${cls}">${inner}</strong>`;
  });
}

const SPREAD_PIECE_RE = /[+\-−]?\d+/g;

export function parseCustomSpread(raw: string): number[] {
  return [...raw.matchAll(SPREAD_PIECE_RE)].map(m =>
    parseInt(m[0].replace(/−/g, '-'), 10)
  );
}

export function capitalizeFirst(text: string): string {
  return text.replace(/^([a-z])/, (_, c: string) => c.toUpperCase());
}

function processAdmonitions(text: string): string {
  let s = text;
  s = s.replace(/^!!! *(\w+) *"([^"]*)"[\r\n]+((?:    .*[\r\n]?)*)/gm, (_, _type, title, body) => {
    const clean = body.replace(/^    /gm, '').trim();
    return `<div class="vamp-admonition"><div class="vamp-admonition__title">${title}</div>\n\n${clean}\n</div>\n`;
  });
  s = s.replace(/^!!! *(\w+)\s*[\r\n]+((?:    .*[\r\n]?)*)/gm, (_, _type, body) => {
    const clean = body.replace(/^    /gm, '').trim();
    return `<div class="vamp-admonition">\n\n${clean}\n</div>\n`;
  });
  return s;
}

export interface SnippetContext {
  blood: number;
  shadow: number;
  resolve: number;
  wits: number;
  demeanor: number;
  bp: number;
  humanity: number;
  maxHp: number;
  patronBp: number;
}

const SHORTHANDS: Record<string, string> = {
  'osirian-penalty': '(humanity-lost/2)@roundup,min:1',
};

const TOKEN_RE = /([+\-−])?\{\{(.+?)\}\}/g;

/* Resolve a bare code to a number from the context */
function resolveCode(code: string, ctx: SnippetContext): number {
  switch (code) {
    case 'blood': return ctx.blood;
    case 'shadow': return ctx.shadow;
    case 'resolve': return ctx.resolve;
    case 'wits': return ctx.wits;
    case 'demeanor': return ctx.demeanor;
    case 'bp': return ctx.bp;
    case 'humanity': return ctx.humanity;
    case 'humanity-lost': return 10 - ctx.humanity;
    case 'max-hp': return ctx.maxHp;
    case 'patron-bp': return ctx.patronBp;
    default: return 0;
  }
}

/* Evaluate an expression string (no modifiers) against character context */
function evaluateExpr(expr: string, ctx: SnippetContext): number {
  const stripped = expr.replace(/[()]/g, '').trim();

  /* Try as bare code first */
  if (/^[a-z-]+$/.test(stripped)) return resolveCode(stripped, ctx);

  /* Binary arithmetic: split at the LAST operator not inside a code name.
     The regex finds the rightmost +, -, *, / that isn't part of a hyphenated code. */
  const binMatch = stripped.match(/^(.+?)([+\-*/])([^+\-*/]+)$/);
  if (binMatch) {
    const left = evaluateExpr(binMatch[1], ctx);
    const right = evaluateExpr(binMatch[3], ctx);
    switch (binMatch[2]) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return right !== 0 ? left / right : 0;
    }
  }

  /* Plain number */
  const num = parseFloat(stripped);
  return isNaN(num) ? 0 : num;
}

/* Resolve a single {{...}} token */
function resolveToken(raw: string, ctx: SnippetContext): string {
  let token = raw.trim();

  /* Expand shorthands */
  if (SHORTHANDS[token]) token = SHORTHANDS[token];

  /* Split expression from modifiers: everything before first @ or # is the expression */
  const modSplit = token.match(/^([^@#]+)(.*)$/);
  if (!modSplit) return '**?**';

  const exprPart = modSplit[1].trim();
  const modPart = modSplit[2].trim();

  let value = evaluateExpr(exprPart, ctx);

  /* Parse modifiers */
  let signed = false;
  for (const mod of modPart.split(/[,@#]/).filter(Boolean)) {
    const m = mod.trim();
    if (m === 'roundup') value = Math.ceil(value);
    else if (m === 'rounddown') value = Math.floor(value);
    else if (m.startsWith('min:')) value = Math.max(value, parseFloat(m.slice(4)));
    else if (m.startsWith('max:')) value = Math.min(value, parseFloat(m.slice(4)));
    else if (m === 'signed') signed = true;
  }

  value = Math.round(value);
  const display = signed && value >= 0 ? `+${value}` : `${value}`;
  return `**${display}**`;
}

/* Replace all {{...}} tokens in snippet text with resolved values */
export function resolveSnippetTokens(text: string, ctx: SnippetContext): string {
  return text.replace(TOKEN_RE, (_match, sign: string | undefined, inner: string) => {
    const resolved = resolveToken(inner, ctx);
    if (!sign) return resolved;
    const num = resolved.replace(/\*\*/g, '').replace(/^[+\-−]/, '');
    return `**${sign}${num}**`;
  });
}

const mdCache = new Map<string, string>();

const renderer = new marked.Renderer();
renderer.link = function({ href, tokens }: { href: string; tokens: Token[] }) {
  const rendered = this.parser.parseInline(tokens);
  if (!/^(https?:\/\/|[#/])/i.test(href)) return rendered;
  const safe = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  if (href.startsWith('https://coterie.zip')) {
    return `<a href="${safe}" target="_blank" rel="noopener">${rendered}</a>`;
  }
  return `<a href="${safe}">${rendered}</a>`;
};

/* Fix bold wrapping multiple pipe-delimited links: **| [A](u) | [B](u)** → | [**A**](u) | [**B**](u) */
function fixBoldPipes(md: string): string {
  return md.replace(/\*\*(\|[^*\n]+)\*\*/g, (_, inner: string) =>
    inner.replace(/\[([^\]]+)\]/g, '[**$1**]')
  );
}

export function renderGameMarkdown(raw: string): string {
  const cached = mdCache.get(raw);
  if (cached) return cached;
  const fixed = fixBoldPipes(raw);
  const admonitioned = processAdmonitions(fixed);
  const rewritten = rewriteMarkdownLinks(admonitioned);
  const html = marked.parse(rewritten, { async: false, breaks: true, renderer }) as string;
  const result = colorTierMarkers(html);
  mdCache.set(raw, result);
  return result;
}
