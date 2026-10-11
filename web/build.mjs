// Bundles the browser code. Run: npm run build:web
import { build } from 'esbuild';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [`${here}/src/site.ts`, `${here}/src/app.ts`],
  outdir: `${here}/dist`,
  bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, sourcemap: false, logLevel: 'info',
  define: { 'process.env.GHOSTTAB_MINT': 'undefined', 'process.env.GHOSTTAB_SELLER_ID': 'undefined', 'process.env.GHOSTTAB_SELLER_SECRET': 'undefined', global: 'globalThis' },
});
