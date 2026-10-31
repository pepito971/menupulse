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
  'src/games/engine/game-app.ts': 20_000, // application des jeux, chargée à la demande
};

// chaque jeu est un fichier séparé, chargé à la première partie : on ne compte que ce qu'il AJOUTE à
// l'application des jeux (déjà chargée quand il arrive)
const GAME_APP = 'src/games/engine/game-app.ts';
const GAME_BUDGET = 4_000;
const ALREADY_LOADED: Record<string, string> = {};
for (const key of Object.keys(manifest)) {
  const parts = key.split('/');
  if (parts.length === 4 && parts[0] === 'src' && parts[1] === 'games' && parts[3] === 'client.ts') {
    BUDGETS[key] = GAME_BUDGET;
    ALREADY_LOADED[key] = GAME_APP;
  }
}

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
  const loaded = ALREADY_LOADED[key] ? collectFiles(ALREADY_LOADED[key]) : new Set<string>();
  const size = [...collectFiles(key)].filter((file) => !loaded.has(file)).reduce((total, file) => total + gzipSync(readFileSync(DIST + file)).length, 0);
  const over = size > budget;
  if (over) failed = true;
  console.log(`${over ? 'TROP  ' : 'OK    '} ${key} : ${(size / 1024).toFixed(1)} Ko gzip (budget ${budget / 1000} Ko)`);
}
if (failed) process.exit(1);
