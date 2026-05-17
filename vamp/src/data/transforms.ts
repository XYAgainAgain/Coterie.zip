import { marked } from 'marked';
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

export function parseHuntingStat(raw: string): StatName {
  return raw.replace(/^\+/, '').trim() as StatName;
}

const MD_LINK_RE = /\(\.\.\/([\w-]+)\/([\w-]+)\.md(#[\w-]*)?\)/g;
const IMG_PATH_RE = /\(\.\.\/assets\//g;
const ATTR_LIST_RE = /\{\s*\.[a-zA-Z0-9_-]+(?:\s+\.[a-zA-Z0-9_-]+)*\s*\}/g;

export function rewriteMarkdownLinks(md: string): string {
  return md
    .replace(MD_LINK_RE, (_match, section: string, slug: string, fragment?: string) => {
      return `(https://coterie.zip/${section}/${slug}/${fragment ?? ''})`;
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

export function renderGameMarkdown(raw: string): string {
  const admonitioned = processAdmonitions(raw);
  const rewritten = rewriteMarkdownLinks(admonitioned);
  const html = marked.parse(rewritten, { async: false }) as string;
  return colorTierMarkers(html);
}
