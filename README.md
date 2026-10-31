# Menupulse

Menus digitaux pour bars et restaurants : **Tapsy** (bar, jeux de table en temps réel) et **Tableo** (restaurant, carte par étapes, allergènes, multilingue).

## Prérequis

- Node.js ≥ 22.18
- PostgreSQL 16

## Installation

```sh
npm install
cp .env.example .env   # puis renseigner DATABASE_URL
npm run dev            # http://localhost:3100 (Vite en middleware, migrations appliquées au démarrage)
```

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement (Vite en middleware, redémarrage à la modification du serveur) |
| `npm start` | serveur de production (sert `dist/client`) |
| `npm run build` | vérification des types, build Vite, contrôle du budget de poids |
| `npm test` | tests unitaires |
| `npm run lint` | ESLint |
| `npm run db:generate` | génère une migration à partir de `server/db/schema.ts` |
| `npm run db:migrate` | applique les migrations |

## Arborescence

```
client/          pages (gabarits Vite), CSS, code navigateur (core/, tapsy/, tableo/, games/, sw/)
shared/          code pur partagé serveur/navigateur : langues, dictionnaires, allergènes, Happy Hour, contrat des jeux
server/          Express 5 : app.ts, index.ts, db/ (schéma, migrations), lib/, routes/, games/ (moteur et jeux)
scripts/         contrôle du budget, données de démonstration
test/            tests node:test
```

Conventions et décisions : voir [CLAUDE.md](CLAUDE.md).
