import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { glob } from 'glob';

const entryPoints = await glob('src/**/*.{ts,tsx,js,jsx}');

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const buildTargets = [
  {
    dir: 'esm',
    format: 'esm',
    packageJson: { type: 'module', sideEffects: false },
    splitting: true
  },
  {
    dir: 'cjs',
    format: 'cjs',
    packageJson: { type: 'commonjs' },
    splitting: false
  }
];

/** @type {Omit<import('esbuild').BuildOptions, 'format' | 'outdir' | 'splitting'>} */
const sharedOptions = {
  bundle: false,
  write: true,
  loader: {
    '.json': 'text'
  },
  platform: 'browser',
  entryPoints,
  allowOverwrite: true,
  minify: false,
  target: ['es2022'],
  packages: 'external'
};

for (const target of buildTargets) {
  const outDir = path.join(distDir, target.dir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'package.json'),
    JSON.stringify(target.packageJson, null, 2)
  );

  /** @type {import('esbuild').BuildOptions} */
  const buildOptions = {
    ...sharedOptions,
    format: target.format,
    splitting: target.splitting,
    outdir: outDir
  };

  await esbuild.build(buildOptions);
}

// ─────────────────────────────────────────────────────────────────────
// Eager / lazy split (mirrors @miden-sdk/react and @miden-sdk/miden-para)
// ─────────────────────────────────────────────────────────────────────
async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function rewriteLazyToEager(dir) {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await rewriteLazyToEager(p);
    } else if (/\.(js|cjs|mjs)$/.test(ent.name)) {
      const before = await fs.readFile(p, 'utf8');
      const after = before.replace(
        /@miden-sdk\/miden-sdk\/lazy/g,
        '@miden-sdk/miden-sdk'
      );
      if (after !== before) await fs.writeFile(p, after);
    }
  }
}

const eagerDir = path.join(distDir, 'eager');
await fs.rm(eagerDir, { recursive: true, force: true });
for (const target of buildTargets) {
  const lazyDir = path.join(distDir, target.dir);
  const eagerVariantDir = path.join(eagerDir, target.dir);
  await copyDir(lazyDir, eagerVariantDir);
  await rewriteLazyToEager(eagerVariantDir);
}
