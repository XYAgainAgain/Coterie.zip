import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { resolve, extname } from 'path';
import { existsSync, createReadStream } from 'fs';

const MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
};

/* Serves /assets/* from ../docs/assets/ during dev so Vamp shares
   the same font/image paths as the production Zensical build. */
function sharedAssets(): Plugin {
  const docsDir = resolve(__dirname, '../docs');
  return {
    name: 'shared-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/assets/')) return next();
        const file = resolve(docsDir, req.url.slice(1));
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
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
