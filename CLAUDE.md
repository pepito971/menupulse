# Menupulse

Plateforme SaaS de menus digitaux pour la restauration hors foyer. **Menupulse** est la marque faîtière (comptes, organisations, établissements, back-office, facturation) ; elle porte deux modules d'expérience client, activés par établissement :

- **Tapsy** (bar) : fiches boissons enrichies (ABV, IBU, dégustation), Happy Hour dynamique, ruptures de stock en 1 clic, mini-jeux de table synchronisés en temps réel.
- **Tableo** (restaurant) : carte par étapes du repas, formules, Ardoise du jour, filtres allergènes (14 allergènes réglementaires) et régimes, multilingue.

Ce fichier documente les conventions et les décisions qui ne se déduisent pas du code. Le README décrit l'installation et les commandes.

## Conventions

- **Français partout** : interface, commentaires, messages d'erreur, commits. Côté clients (à table) : **vouvoiement**.
- **Vanilla TypeScript, modules ES natifs, aucun framework** côté navigateur ; composants en classes. Vite 8 construit le front (`client/`).
- **Node ≥ 22.18 exécute le TypeScript directement** (suppression des types), sans `tsx` ni `dotenv` (`--env-file-if-exists`). Conséquence : **syntaxe effaçable uniquement** (`erasableSyntaxOnly`) — ni `enum`, ni propriétés de paramètre de constructeur, ni `namespace` — et imports relatifs **avec l'extension `.ts`**.
- **Un tsconfig par environnement** : `shared/` (ni DOM ni Node : code pur, testé), `client/` (DOM), `client/src/sw/` (WebWorker), `server/` (Node), racine (configs, scripts, tests). `npm run typecheck` les vérifie tous.
- **Le navigateur n'importe que des types depuis le code serveur ou Zod** (`import type`, imposé par ESLint `consistent-type-imports` et `verbatimModuleSyntax`) : Zod ne doit jamais entrer dans le bundle client. Le script de budget le détecterait.
- **Rendu côté serveur** des pages publiques : gabarit Vite (`client/<page>.html`, marqueurs `<!--app-head-->`/`<!--app-html-->`) complété par `server/lib/pages.ts`. Tout HTML passe par le gabarit `html\`…\`` (`server/lib/html.ts`) qui **échappe par défaut** ; `raw()` seulement pour un fragment déjà sûr. Les remplacements dans le gabarit se font **par fonction** (`replace(x, () => valeur)`) : une chaîne de remplacement interpréterait `$&`, `$1`… contenus dans les données.
- **Données de page** dans `<script type="application/json" id="page-data">` (langue, dictionnaire, données) : aucune requête au chargement.
- **CSS sur mesure** : `client/css/theme.css` (variables, `light-dark()`, zones tactiles `--tap-min: 48px`, `box-sizing: border-box` global), une feuille par module. Pas de couleur en dur hors des variables. Composants préfixés `ui-`. Propriétés CSS **logiques** (`margin-inline-start`…) pour accueillir un jour une langue écrite de droite à gauche.
- **Prix en centimes entiers**, jamais en nombre à virgule.
- **Base : PostgreSQL 16 + Drizzle**, colonnes en `snake_case` automatique (`casing: 'snake_case'`, dans `drizzle.config.ts` ET `server/db/client.ts`). Migrations générées (`npm run db:generate`), appliquées au démarrage. **Une migration écrite sur une branche longue se régénère après rattrapage de `main`** (Drizzle n'applique qu'une migration plus récente que la dernière appliquée).
- **Multi-établissements** : toute table métier porte `establishment_id` ; les références entre tables métier sont des **clés étrangères composites** `(establishment_id, id)`, pour que la base refuse un lien entre deux établissements quel que soit le code qui écrit.
- **Express 5** (rattrape les promesses rejetées des routes : une erreur ne fait pas tomber le processus, qui tient aussi les parties en mémoire).

## Décisions (et leur pourquoi)

- **Ce que voit le client : la marque de l'établissement**, « propulsé par Tapsy/Tableo » en discret. Un seul domaine, chemins courts (`/c/<slug>/<langue>`) : l'URL est imprimée en QR code sur des chevalets, plus elle est courte, mieux le QR se lit.
- **Un QR code par table → écran de choix** bar / restaurant quand l'établissement a les deux modules (rendu serveur, quasi sans JS). Chaque module reste une page à part (`tapsy.html`, `tableo.html`) avec son propre budget : un client du restaurant ne télécharge jamais le code des jeux.
- **Organisations dès le départ** : une organisation possède les établissements, la facturation et l'équipe. Un membre sans ligne dans `member_establishments` a accès à tous les établissements de l'organisation (liste blanche, comme les calques dans Planevo).
- **Multilingue** (français + anglais au lancement) :
  - interface : dictionnaires TypeScript (`shared/i18n/`), `fr.ts` de référence, les autres `satisfies Record<MessageKey, string>` → une clé manquante est une erreur de compilation ; formats par `Intl` ;
  - contenu saisi par l'établissement : JSONB `{ fr, en }` par champ ; à défaut de traduction, la langue par défaut de l'établissement, affichée avec son attribut `lang` ;
  - **allergènes = codes**, jamais du texte libre (noms officiels de l'annexe II du règlement INCO dans les dictionnaires) : une traduction automatique ne peut pas altérer une information allergène ;
  - langue dans l'URL, pas dans un cookie (cache par URL : navigateur, Service Worker, CDN) ;
  - traduction automatique prévue plus tard : colonne `translations` (`auto` / `reviewed` par langue) déjà présente.
- **Sessions en base (`connect-pg-simple`), pas de JWT** : révocables immédiatement (employé parti, déconnexion). Cookie `HttpOnly`, `Secure` en production, **`SameSite=Lax`** (`Strict` déconnecterait le gérant arrivant par un lien d'email) + vérification de l'en-tête `Origin` sur toute requête qui modifie des données (`server/lib/origin-check.ts`). Les sessions ne sont montées que sur `/api/auth` et `/api/admin` : un client à table n'en a jamais.
- **Happy Hour : on stocke la règle** (jours, horaires, fuseau de l'établissement), jamais un prix calculé ; la même fonction pure (`shared/happy-hour.ts`) sert au serveur et au téléphone, donc un menu affiché depuis le cache montre le bon prix à la bonne heure. Fuseau par établissement (pas de Paris codé en dur).
- **Menu versionné** (`establishments.menu_version`, +1 à chaque modification, rupture de stock comprise) : sert d'ETag, le Service Worker revalide en arrière-plan et la page se redessine si la version a changé.
- **Images hors de la base** (jamais en base64 dans une colonne : ça alourdirait chaque réponse du menu). Stockage à trancher (voir « En attente »).
- **Une seule instance Railway au départ** : l'état des parties est en mémoire ; un redéploiement termine les parties en cours (à faire aux heures creuses). Plusieurs instances = Redis derrière l'interface du moteur.
- **Lighthouse CI** : LCP ≤ 1 s en profil bureau (médiane de 5 passages), ≈ 2 s en mobile simulé ; le TBT remplace l'INP (non mesurable en laboratoire). Le **garde-fou bloquant est le poids** (`scripts/check-budget.ts`, budgets par point d'entrée, gzip).

## En attente de décision

- Stockage des images (stockage objet type Cloudflare R2, Railway Buckets, ou volume Railway).
- Facturation : modules vendus séparément ou forfait, jeux en option payante.

## Git

- Jamais de travail direct sur `main` : une branche par chantier, un commit par lot cohérent.
- Jamais de fusion dans `main`, d'envoi sur GitHub ni de déploiement sans accord explicite de l'utilisateur.

## Vérification

- `npm test` (tests `node:test` en TypeScript, `test/**/*.test.ts`), `npm run typecheck`, `npm run lint`, `npm run build` (inclut le budget de poids).
- Port local par défaut **3100** (Planevo occupe le 3000 sur cette machine).
