const injected = new Set<string>();

export function preloadPortraits(urls: string[]): void {
  for (const url of urls) {
    if (!url || injected.has(url)) continue;
    injected.add(url);
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
  }
}
