import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { resolve, extname, sep } from 'path';
import { existsSync, statSync, createReadStream } from 'fs';

const MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

/* Serves /assets/* from ../docs/assets/ and everything else outside /vamp/ from the
   built ../site/ so root-relative paths (search index, result links) match production. */
function sharedAssets(): Plugin {
  const docsDir = resolve(__dirname, '../docs');
  const siteDir = resolve(__dirname, '../site');
  return {
    name: 'shared-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let url: string;
        try {
          url = decodeURIComponent(req.url?.replace(/[?#].*$/, '') ?? '');
        } catch {
          return next();
        }
        /* Containment check: a crafted ../ path must not escape the shared dirs */
        const safeResolve = (base: string, rel: string) => {
          const file = resolve(base, rel);
          return file.startsWith(base + sep) ? file : null;
        };
        const send = (file: string) => {
          res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
          createReadStream(file).pipe(res);
        };
        if (url.startsWith('/assets/')) {
          const file = safeResolve(docsDir, url.slice(1));
          if (file && existsSync(file)) return send(file);
          /* theme-built assets (search worker, bundles) exist only under site/ — fall through */
        }
        if (!url.startsWith('/vamp/') && url.startsWith('/')) {
          const file = safeResolve(siteDir, url.slice(1) + (url.endsWith('/') ? 'index.html' : ''));
          if (file && existsSync(file) && statSync(file).isFile()) return send(file);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [sharedAssets(), preact()],
  base: '/vamp/',
  build: { outDir: 'dist' },
  server: {
    fs: { allow: [resolve(__dirname, '..')] },
  },
});
