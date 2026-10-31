# Menupulse

Menus digitaux pour bars et restaurants : **Tapsy** (bar, jeux de table en temps réel) et **Tableo** (restaurant, carte par étapes, allergènes, multilingue).

## Prérequis

- Node.js ≥ 22.18
- PostgreSQL 16

## Installation

```sh
npm install
cp .env.example .env   # puis renseigner DATABASE_URL
# ou, sous Windows avec PostgreSQL 16 installé : crée le rôle et la base « menupulse » et écrit DATABASE_URL
powershell -ExecutionPolicy Bypass -File scripts/create-local-db.ps1
npm run seed:demo      # établissement de démonstration
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
| `npm run seed:demo` | crée l'établissement de démonstration (jeux : http://localhost:3100/jouer/demo-table-1) |

## Arborescence

```
client/          pages (gabarits Vite), CSS, code navigateur (core/, tapsy/, tableo/, games/, sw/)
shared/          code pur partagé serveur/navigateur : langues, dictionnaires, allergènes, Happy Hour, contrat des jeux
server/          Express 5 : app.ts, index.ts, db/ (schéma, migrations), lib/, routes/, games/ (moteur et jeux)
scripts/         contrôle du budget, données de démonstration
test/            tests node:test
```

## Jeux de table (Tapsy)

Sept jeux synchronisés en temps réel (WebSocket `/ws`), sans compte joueur : Quiz du Comptoir, Tu préfères ?, L'Intrus, Action ou Vérité, Le Mot Interdit, La Boisson Mystère, Le Jack-Pot de l'Happy Hour. Ajouter un jeu : ses règles dans `server/games/<id>/` (inscrites dans `server/games/registry.ts`) et son composant dans `client/src/games/<id>/client.ts` — le moteur ne change pas.

Conventions et décisions : voir [CLAUDE.md](CLAUDE.md).
