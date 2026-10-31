// Échoue si un point d'entrée dépasse son budget : JS + CSS chargés d'office, compressés en gzip.
// C'est le garde-fou bloquant (résultat identique à chaque passage, contrairement à une mesure Lighthouse).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

type Chunk = { file: string; imports?: string[]; css?: string[] };

const DIST = 'dist/client/';
const manifest: Record<string, Chunk> = JSON.parse(readFileSync(`${DIST}.vite/manifest.json`, 'utf8'));

const BUDGETS: Record<string, number> = {
  'tapsy.html': 25_000,
  'tableo.html': 25_000,
};

function collectFiles(key: string, seen = new Set<string>()): Set<string> {
  const chunk = manifest[key];
  if (!chunk || seen.has(chunk.file)) return seen;
  seen.add(chunk.file);
  chunk.css?.forEach((file) => seen.add(file));
  chunk.imports?.forEach((dependency) => collectFiles(dependency, seen));
  return seen;
}

let failed = false;
for (const [key, budget] of Object.entries(BUDGETS)) {
  if (!manifest[key]) {
    console.log(`ABSENT ${key} : point d'entrée introuvable dans le manifeste (page renommée ?)`);
    failed = true;
    continue;
  }
  const size = [...collectFiles(key)].reduce((total, file) => total + gzipSync(readFileSync(DIST + file)).length, 0);
  const over = size > budget;
  if (over) failed = true;
  console.log(`${over ? 'TROP  ' : 'OK    '} ${key} : ${(size / 1024).toFixed(1)} Ko gzip (budget ${budget / 1000} Ko)`);
}
if (failed) process.exit(1);
