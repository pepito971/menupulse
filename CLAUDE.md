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

## Back-office

API sous `/api/auth` (connexion) et `/api/admin` (organisations, établissements, tables, équipe) ; **interface en attente de la maquette de l'utilisateur**.

- **Pas d'email pour l'instant** : le compte du propriétaire est créé par `npm run account:create`, ceux de l'équipe par un responsable, toujours avec un **mot de passe provisoire** affiché une seule fois et à changer à la première connexion (`users.password_change_required` : tant qu'il est vrai, seules `/api/auth/me` et `/api/auth/password` répondent). Inscription en ligne, invitations et mot de passe oublié attendent le choix d'un fournisseur d'emails. Ajouter un compte qui existe déjà (membre d'une autre organisation) est refusé jusqu'aux invitations, qui demandent l'accord du titulaire ; pour la même raison, un responsable ne réinitialise pas le mot de passe d'un compte qui appartient aussi à une autre organisation.
- **Droits** dans `shared/roles.ts` (partagé : le navigateur masque ce que le serveur refuserait). Propriétaire : tout. Gérant : réglages de l'établissement (pas l'adresse publique `slug` ni les modules, liés à l'abonnement), tables, et les **employés seulement**, dans les limites de ses propres établissements (`isWithinScope`). Employé : consultation (ruptures et jeux viendront avec la carte). **Personne ne modifie son propre accès**, et seul un propriétaire touche à un propriétaire : l'organisation garde donc toujours un propriétaire.
- **Droits relus en base à chaque requête** (`server/admin/access.ts`) : un membre retiré ou restreint perd l'accès aussitôt ; mot de passe changé ou réinitialisé = autres sessions supprimées (`revokeUserSessions`). Organisation ou établissement étranger → **404**, pas 403.
- `member_establishments` porte une clé composite vers `establishments (organization_id, id)` : la base refuse d'ouvrir à un membre l'établissement d'une autre organisation. Un propriétaire n'a jamais de liste.
- Modifier les réglages ou les modules fait avancer `menu_version`. Supprimer une table efface les statistiques de ses parties (cascade) ; la désactiver les garde. Nouveau jeton de QR code = l'ancien lien cesse aussitôt de fonctionner.
- **URL imprimée dans le QR code d'une table : à décider** avant d'imprimer quoi que ce soit (aujourd'hui `/jouer/<jeton>` ; l'écran de choix bar/restaurant n'existe pas encore).

## Jeux de table (Tapsy)

Sept jeux au lancement : Quiz du Comptoir, Tu préfères ?, L'Intrus, Action ou Vérité, Le Mot Interdit, La Boisson Mystère et Le Jack-Pot de l'Happy Hour (ces deux derniers sont des leviers commerciaux, désactivés par défaut). Entrée : `/jouer/<jeton QR de la table>/<langue>`.

- **Moteur générique** : `shared/games/types.ts` est le contrat. Un jeu = des règles pures (`server/games/<id>/index.ts`, inscrites dans `server/games/registry.ts`) + un composant (`client/src/games/<id>/client.ts`, classe exportée par défaut, découverte automatiquement par `import.meta.glob` et chargée dans son propre fichier). Le moteur (`server/games/engine/room.ts`) ne connaît aucun jeu ; un test vérifie que les deux registres correspondent. **Ajouter un jeu ne touche ni au moteur ni au schéma** : identifiants en texte, réglages (`establishment_games.settings`) et contenus (`game_content_packs.content`) en JSONB validés par les schémas Zod du jeu.
- **Le serveur fait autorité** : les téléphones envoient des intentions, chaque jeu les valide (`actionSchema`) et calcule une **vue par joueur** (`view`), dans sa langue. Ce qui doit rester secret (bonne réponse, votes avant la fin, mot à faire deviner, boisson mystère) n'est jamais dans la vue avant l'heure ; des tests le vérifient. Horloge et hasard injectés (`RuleContext`) : une partie entière se teste avec une horloge simulée (`test/support/game-harness.ts`). Points comptés à la **réception** du message (vitesse, premier clic).
- **Une erreur dans un jeu arrête la partie, jamais le serveur** (`Room.#run`, try/catch) ; les autres tables continuent.
- **WebSocket `/ws`** (`server/games/engine/hub.ts`) : vérification de l'`Origin` à l'ouverture, messages de 2 Ko au plus validés par Zod, 10 messages/s par connexion (seau à jetons : `express-rate-limit` ne voit pas les messages WebSocket), message `hello` obligatoire dans les 5 s avec le jeton de place (**jamais dans l'URL**), battement de cœur 15 s. En développement, le rechargement à chaud de Vite partage le serveur HTTP : le hub ne traite que `/ws` et laisse les autres demandes d'upgrade.
- **Pas de compte joueur** : `POST /api/play/join` (pseudo vérifié, `server/lib/pseudo.ts` ; 60/min par IP, large à cause du NAT des bars) donne un jeton de place. **Reprise automatique** : jeton gardé dans `sessionStorage` (propre à l'onglet) ; après un rechargement ou une coupure, le téléphone se reconnecte seul (attente croissante, 10 s au plus, immédiate au retour au premier plan) et le serveur renvoie l'état complet. Place gardée 45 s (jusqu'à la fin de la partie si elle est en cours). 10 joueurs par table ; un arrivant pendant une partie regarde et joue à la suivante.
- **RGPD** : pseudos et scores en mémoire seulement. En base : résumé des parties sans pseudo (`game_sessions`), bons (`game_vouchers`), et le meilleur joueur de la semaine/du mois par jeu (`game_hall_of_fame`) **seulement s'il l'a accepté** (case décochée par défaut), à purger après 12 mois (purge à écrire) et supprimable par le personnel.
- **Bons** : codes de 6 caractères sans 0/O ni 1/I, uniques par établissement, éphémères. Le code affiché n'a de valeur que vérifié en base par le personnel (`redeemed_at`, `expires_at`) : une capture réutilisée ou inventée est refusée — **écran de vérification au comptoir à construire** avec le back-office.
- **Garde-fous des leviers commerciaux** : Jack-Pot jouable seulement pendant une Happy Hour calculée depuis les règles (pas de booléen `is_happy_hour` stocké), une partie par table et par jour, plafond de gains par jour pour l'établissement (`maxWinsPerDay`, compté en base), tirage par `crypto.randomInt`. Boisson Mystère : indices générés depuis la fiche produit (`boisson-mystere/hints.ts`), boissons **sans alcool seulement** par défaut (`allowAlcoholicDrinks`).
- **Salon d'après la maquette de l'utilisateur** (« À vous de jouer », `client/src/games/engine/lobby.ts`, `client/css/lobby.css`, palette lavande / citron vert dans `tapsy.css`) : en-tête Tapsy « par Menupulse » + pastille de table (rendus par le serveur), puis trois onglets dans une barre fixe du bas (Jouer, Classement, Équipe ; onglet gardé dans `sessionStorage`). Jouer : héros, carte de l'équipe, bons et vainqueur de la dernière partie, **quiz mis en avant** (repères tirés de `facts()` du jeu : questions, durée, points maximum), **Jack-Pot en carte « hasard »**, autres jeux en grille (surtitre `game.kind.<id>`, pictogramme `GAME_ICONS`). **La table est une équipe pour la soirée** : nom tiré d'une liste (`shared/games/team-names.ts`), stable pour une table et un jour ; points = somme des points de tous ses joueurs (`Room.standings`, gardés après le départ d'un joueur, perdus quand la table se vide). Classement : dernière partie, soirée à la table, **records du mois** de l'établissement (`loadHallOfFame`, relus à l'ouverture de la table et après chaque record). La barre du bas disparaît pendant une partie. **Écart avec la décision « marque de l'établissement »** : la maquette met Tapsy en tête, le nom de l'établissement n'apparaît que dans la carte d'équipe — à trancher par l'utilisateur.
- **Points juridiques à faire valider par un juriste avant ouverture** : gains ou réductions sur de l'alcool obtenus par un jeu, public jeune (loi Évin, incitation) ; Jack-Pot = jeu de hasard avec gain → la participation doit rester **gratuite et sans obligation d'achat** (interdiction des loteries) ; contenus fournis sans défi lié à l'alcool. Le bouton « Validé ! 🍻 » est conservé tel que demandé, modifiable dans les dictionnaires.
- **Hors périmètre pour l'instant** : blind test audio (droits musicaux), parties à l'échelle de la salle (prévues par le modèle : `roomKind`), écran du bar (rôle `display` prévu par le contrat), réglage des jeux dans le back-office.

## En attente de décision

- Stockage des images (stockage objet type Cloudflare R2, Railway Buckets, ou volume Railway).
- Facturation : modules vendus séparément ou forfait, jeux en option payante.

## Git

- Jamais de travail direct sur `main` : une branche par chantier, un commit par lot cohérent.
- Jamais de fusion dans `main`, d'envoi sur GitHub ni de déploiement sans accord explicite de l'utilisateur.

## Vérification

- `npm test` (tests `node:test` en TypeScript, `test/**/*.test.ts`, `.env` chargé), `npm run typecheck`, `npm run lint`, `npm run build` (inclut le budget de poids). Les tests de l'API du back-office tournent sur la base de `DATABASE_URL` (sautés sans elle) : ils créent leurs organisations et comptes (`…@test.menupulse.fr`) et les suppriment.
- Port local par défaut **3100** (Planevo occupe le 3000 sur cette machine).
- `npm run seed:demo` crée « Le Comptoir Démo » : jeux sur http://localhost:3100/jouer/demo-table-1 (Happy Hour toute la journée pour essayer le Jack-Pot) et trois comptes du back-office, un par rôle (`proprietaire@`, `gerant@`, `serveur@demo.menupulse.fr`, mot de passe `comptoir-demo`).
- **Base locale dédiée** (`menupulse`, rôle `menupulse` propriétaire, mot de passe aléatoire) créée par `scripts/create-local-db.ps1`, à lancer par l'utilisateur : il faut le mot de passe administrateur `postgres`, que Claude n'a pas. Jamais la base ni le rôle de Planevo (`geodesign`).
- **Python sous Windows écrit des fins de ligne CRLF** (`open(..., 'w')`) : ouvrir avec `newline=''` pour garder les LF du dépôt.
- **Piège des outils d'écriture** : une séquence d'échappement Unicode (barre oblique inverse, `u`, quatre chiffres hexadécimaux) écrite dans un fichier peut être décodée en vrai caractère (un séparateur de ligne a cassé une expression régulière). Construire ces caractères avec `String.fromCharCode` ou s'en passer.
