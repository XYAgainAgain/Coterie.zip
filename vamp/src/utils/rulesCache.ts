import { renderGameMarkdown } from '../data/transforms';

export interface RulesSection { title: string; body: string }
export interface ParsedRules { title: string; intro: string; sections: RulesSection[] }

let cached: ParsedRules | null = null;
let pending: Promise<ParsedRules | null> | null = null;

function parseRulesMarkdown(raw: string): ParsedRules {
  const parts = raw.split(/\n(?=## )/);
  const titleMatch = parts[0].match(/^#\s+(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const intro = parts[0].replace(/^#\s+.*\n+/, '');
  const sections = parts.slice(1).map(chunk => {
    const newline = chunk.indexOf('\n');
    return {
      title: chunk.slice(3, newline > 0 ? newline : undefined).trim(),
      body: newline > 0 ? chunk.slice(newline + 1).trim() : '',
    };
  });
  return { title, intro, sections };
}

/* Pre-render all markdown sections so the Rules tab opens instantly */
function prerender(parsed: ParsedRules): ParsedRules {
  return {
    title: renderGameMarkdown(parsed.title),
    intro: renderGameMarkdown(parsed.intro),
    sections: parsed.sections.map(s => ({
      title: s.title,
      body: renderGameMarkdown(s.body),
    })),
  };
}

export function prefetchRules(): void {
  if (cached || pending) return;
  pending = fetch(import.meta.env.BASE_URL + 'How-to-Coterie.md')
    .then(r => r.ok ? r.text() : '')
    .then(text => {
      if (!text) return null;
      cached = prerender(parseRulesMarkdown(text));
      return cached;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
}

export function getCachedRules(): ParsedRules | null {
  return cached;
}

export function getRulesPending(): Promise<ParsedRules | null> | null {
  return pending;
}
