import { useEffect, useRef, useState } from 'preact/hooks';

/* Zensical's own search worker (path from the site's __config), fed /search.json — ranking,
   totals, and highlight ranges are the site engine's verbatim, only the rendering is Vamp's. */

interface IndexItem {
  location: string;
  title: string;
  text: string;
  path: string[];
}

interface HighlightRange { start: number; end: number }

interface WorkerMatch {
  field: 'title' | 'text' | 'path' | 'tags';
  value: { highlight?: { ranges: HighlightRange[] } };
}

interface WorkerItem { id: number; matches: WorkerMatch[] }

interface WorkerResult {
  items: WorkerItem[];
  pagination: { total: number; prev?: unknown; next?: unknown };
}

/* Shape the site's main bundle sends with every query */
const QUERY_FILTER = {
  input: { type: 'operator', data: { operator: 'and', operands: [] } },
  aggregation: { input: [{ type: 'term', data: { field: 'tags' } }] },
};

const EXCERPT_BEFORE = 80;
const EXCERPT_AFTER = 560;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/* Highlight ranges index the raw HTML, so track how each raw index maps into the plain text */
function htmlToPlain(html: string): { plain: string; map: Int32Array } {
  const map = new Int32Array(html.length + 1);
  let plain = '';
  let i = 0;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '<') {
      const close = html.indexOf('>', i);
      const end = close === -1 ? html.length : close + 1;
      while (i < end) map[i++] = plain.length;
      continue;
    }
    if (ch === '&') {
      const close = html.indexOf(';', i);
      if (close !== -1 && close - i <= 8) {
        const name = html.slice(i + 1, close);
        const cp = name[0] === '#' ? parseInt(name[1] === 'x' ? name.slice(2) : name.slice(1), name[1] === 'x' ? 16 : 10) : NaN;
        const decoded = name[0] === '#'
          ? (cp > 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : '?')
          : ENTITIES[name];
        if (decoded) {
          const end = close + 1;
          while (i < end) map[i++] = plain.length;
          plain += decoded;
          continue;
        }
      }
    }
    map[i++] = plain.length;
    plain += ch;
  }
  map[html.length] = plain.length;
  return { plain, map };
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = ranges.filter(r => r.start < r.end).sort((a, b) => a.start - b.start);
  const out: HighlightRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

/* Plain text + ranges → text/<mark> segments (offset shifts everything left for excerpts) */
function markSegments(text: string, ranges: HighlightRange[], offset = 0) {
  const nodes = [];
  let pos = 0;
  for (const r of ranges) {
    const start = Math.max(0, r.start - offset);
    const end = Math.min(text.length, r.end - offset);
    if (end <= pos || start >= text.length) continue;
    if (start > pos) nodes.push(text.slice(pos, start));
    nodes.push(<mark>{text.slice(Math.max(pos, start), end)}</mark>);
    pos = end;
  }
  if (pos < text.length) nodes.push(text.slice(pos));
  return nodes;
}

type EngineQuery = { input: string; page?: unknown };

interface Engine {
  items: IndexItem[];
  search(q: EngineQuery): Promise<WorkerResult>;
}

let enginePromise: Promise<Engine> | null = null;

function loadEngine(): Promise<Engine> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const [pageText, index] = await Promise.all([
      fetch('/404.html').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),
      fetch('/search.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    ]);
    const cfgMatch = pageText.match(/<script id="__config"[^>]*>(.*?)<\/script>/s);
    if (!cfgMatch) throw new Error('No __config in site page');
    const workerPath = JSON.parse(cfgMatch[1]).search.replace(/^\.\//, '/');
    const worker = new Worker(workerPath);

    const resolvers: Array<(r: WorkerResult) => void> = [];
    const ready = new Promise<void>((res, rej) => {
      worker.onerror = e => rej(new Error(`Search worker failed to load: ${e.message || workerPath}`));
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 1) res();
        else if (e.data.type === 3) resolvers.shift()?.(e.data.data);
      };
    });
    worker.postMessage({ type: 0, data: { items: index.items, config: index.config } });
    await ready;
    worker.onerror = e => console.warn('[Search] Worker error:', e.message);

    return {
      items: index.items as IndexItem[],
      /* Worker answers strictly in order, so a FIFO of resolvers correlates replies */
      search: (q: EngineQuery) => new Promise<WorkerResult>(res => {
        resolvers.push(res);
        worker.postMessage({ type: 2, data: { input: q.input, filter: QUERY_FILTER, page: q.page } });
      }),
    };
  })().catch(err => {
    enginePromise = null;
    console.warn('[Search] Engine load failed:', err);
    throw err;
  });
  return enginePromise;
}

function fieldRanges(item: WorkerItem, field: WorkerMatch['field']): HighlightRange[] {
  return mergeRanges(item.matches.filter(m => m.field === field).flatMap(m => m.value.highlight?.ranges ?? []));
}

function Crumbs({ path, ranges }: { path: string[]; ranges: HighlightRange[] }) {
  /* Path ranges index the bare segment concatenation (no separators) */
  const nodes = [];
  let cum = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) nodes.push(' › ');
    const local = ranges
      .filter(r => r.start < cum + path[i].length && r.end > cum)
      .map(r => ({ start: r.start - cum, end: r.end - cum }));
    nodes.push(...markSegments(path[i], local));
    cum += path[i].length;
  }
  return <span class="vamp-search__result-crumbs">{nodes}</span>;
}

function Excerpt({ html, ranges }: { html: string; ranges: HighlightRange[] }) {
  const { plain, map } = htmlToPlain(html);
  const plainRanges = ranges.map(r => ({ start: map[r.start], end: map[r.end] }));
  const first = plainRanges[0];
  const from = first ? Math.max(0, first.start - EXCERPT_BEFORE) : 0;
  const to = first ? Math.min(plain.length, first.end + EXCERPT_AFTER) : Math.min(plain.length, EXCERPT_AFTER);
  return (
    <span class="vamp-search__result-excerpt">
      {from > 0 && '…'}
      {markSegments(plain.slice(from, to), plainRanges, from)}
      {to < plain.length && '…'}
    </span>
  );
}

/* The site appends ?h=<query> so the target page highlights the terms on arrival */
function resultHref(location: string, query: string): string {
  const [base, anchor] = location.split('#', 2);
  const h = encodeURIComponent(query).replace(/%20/g, '+');
  return `/${base}?h=${h}${anchor ? `#${anchor}` : ''}`;
}

export function SiteSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<WorkerResult | null>(null);
  const [items, setItems] = useState<WorkerItem[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const queryRef = useRef('');
  const pageBusy = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const runQuery = async (input: string, page?: unknown) => {
    try {
      const engine = engineRef.current ?? (engineRef.current = await loadEngine());
      if (queryRef.current !== input) return;
      const res = await engine.search({ input, page });
      if (queryRef.current !== input) return;
      setFailed(false);
      setResult(res);
      setItems(prev => (res.pagination.prev !== undefined ? [...prev, ...res.items] : res.items));
      if (page === undefined) setSelected(0);
    } catch {
      setFailed(true);
    }
  };

  const onInput = (value: string) => {
    setQuery(value);
    queryRef.current = value;
    setOpen(true);
    if (value.trim()) runQuery(value);
    else { setResult(null); setItems([]); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Infinite scroll: fetch the next page when the sentinel enters the panel viewport */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && result?.pagination.next !== undefined && !pageBusy.current) {
        pageBusy.current = true;
        runQuery(queryRef.current, result.pagination.next).finally(() => { pageBusy.current = false; });
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [result]);

  const showPanel = open && query.trim().length > 0;
  const engine = engineRef.current;

  const go = (location: string) => {
    /* New tab is load-bearing: without a target, preact-router swallows these root-relative links */
    window.open(resultHref(location, queryRef.current), '_blank', 'noopener');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      setSelected(s => (s + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      setSelected(s => (s - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && items[selected] && engine) {
      go(engine.items[items[selected].id].location);
    }
  };

  return (
    <div class="vamp-search">
      {/* Zensical's Lucide search icon, inlined because stroke-only SVGs fail as Firefox masks */}
      <svg class="vamp-search__icon" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m21 21-4.34-4.34" />
        <circle cx="11" cy="11" r="8" />
      </svg>
      <input
        ref={inputRef}
        class="vamp-search__input"
        type="search"
        placeholder="Search Coterie.zip"
        aria-label="Search the Coterie.zip rules site"
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        value={query}
        onFocus={() => { setOpen(true); if (!engineRef.current) loadEngine().then(e => { engineRef.current = e; if (queryRef.current.trim()) runQuery(queryRef.current); }).catch(() => setFailed(true)); }}
        onBlur={() => setOpen(false)}
        onInput={e => onInput((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
      />
      <kbd class="vamp-search__key" aria-hidden="true">Ctrl+K</kbd>
      {showPanel && (
        /* Result mousedown would blur the input and close the panel before click lands;
           bare-panel mousedown stays default so the scrollbar remains draggable */
        <div class="vamp-search__panel" role="listbox" onMouseDown={e => { if ((e.target as HTMLElement).closest('.vamp-search__result')) e.preventDefault(); }}>
          {failed ? (
            <div class="vamp-search__empty">Search unavailable</div>
          ) : !result || !engine ? (
            <div class="vamp-search__empty">Searching…</div>
          ) : items.length === 0 ? (
            <div class="vamp-search__empty">No matching documents</div>
          ) : (
            <>
              <div class="vamp-search__count">{result.pagination.total} result{result.pagination.total === 1 ? '' : 's'}</div>
              {items.map((it, i) => {
                const doc = engine.items[it.id];
                return (
                  <a
                    key={`${it.id}-${i}`}
                    class={`vamp-search__result ${i === selected ? 'vamp-search__result--selected' : ''}`}
                    href={resultHref(doc.location, query)}
                    target="_blank"
                    rel="noopener"
                    role="option"
                    aria-selected={i === selected}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <Crumbs path={doc.path} ranges={fieldRanges(it, 'path')} />
                    <span class="vamp-search__result-title">{markSegments(doc.title, fieldRanges(it, 'title'))}</span>
                    <Excerpt html={doc.text} ranges={fieldRanges(it, 'text')} />
                  </a>
                );
              })}
              {result.pagination.next !== undefined && <div ref={sentinelRef} class="vamp-search__sentinel" />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
