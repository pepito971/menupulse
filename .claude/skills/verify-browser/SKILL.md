---
name: verify-browser
description: Vérifie une fonctionnalité de Menupulse dans un vrai navigateur via Playwright (téléphones de clients à une table, jeux à plusieurs joueurs, back-office, captures d'écran, erreurs console). À utiliser après toute modification d'un écran (client/, server/lib/pages.ts, rendu serveur) avant de la considérer terminée : `npm test` vérifie la logique, pas ce que voit le client sur son téléphone.
---

# Vérification navigateur (Playwright)

`npm test` couvre les règles (jeux, droits, API). Ce qui s'affiche sur un téléphone, le
temps réel entre plusieurs joueurs et les erreurs du navigateur se vérifient en pilotant un
vrai Chromium, avec les aides de `test/support/browser.ts`.

## Prérequis (une fois par machine)

```
npm install
npx playwright install chromium
```

`playwright` est une dépendance de développement du projet : ne pas l'installer ailleurs.

## Avant de lancer un script

1. Base disponible et démonstration à jour : `npm run seed:demo` (« Le Comptoir Démo »,
   tables `demo-table-1` et `demo-table-2`, comptes `proprietaire@`, `gerant@`,
   `serveur@demo.menupulse.fr`, mot de passe `comptoir-demo`).
2. Serveur de développement : `npm run dev` (port 3100). **Si le port 3100 est déjà pris**
   (autre session, ancien serveur), ne pas arrêter ce processus : lancer le sien en arrière-plan sur un
   autre port et pointer les aides dessus avec la même origine (le serveur refuse les
   modifications venant d'une autre origine) :

   ```
   PORT=3101 APP_ORIGIN=http://localhost:3101 node --env-file-if-exists=.env server/index.ts --vite
   APP_ORIGIN=http://localhost:3101 node test/scratch/verify-<feature>.ts
   ```

   Vérifier qu'il répond : `curl -s localhost:3101/api/health`. L'arrêter à la fin.

## Écrire un script

Dans `test/scratch/` (ignoré par git, jetable), en TypeScript exécuté directement par Node :
`test/scratch/verify-<feature>.ts`.

```ts
import { api, collectConsoleErrors, DEMO, desktop, joinTable, launch, loginBackOffice, phone } from '../support/browser.ts';

const browser = await launch(); // launch({ headed: true }) pour regarder
try {
  // chaque téléphone est un contexte isolé = un joueur distinct (sessionStorage propre)
  const lea = await phone(browser);
  const tom = await phone(browser, { locale: 'en' });
  const errors = [...collectConsoleErrors(lea), ...collectConsoleErrors(tom)];
  await joinTable(lea, 'Léa');
  await joinTable(tom, 'Tom', { lang: 'en' });

  // --- scénario de la fonctionnalité ---
  await lea.screenshot({ path: 'test/scratch/<feature>-lea.png', fullPage: true });

  // back-office : session par l'API tant que l'interface n'existe pas
  const manager = await desktop(browser);
  await loginBackOffice(manager, DEMO.manager);
  console.log(await api(manager, 'GET', '/api/auth/me'));

  console.log('erreurs console :', JSON.stringify(errors));
} finally {
  await browser.close();
}
```

Exécuter avec `node test/scratch/verify-<feature>.ts`, lire les sorties et **regarder les
captures** (outil Read sur le PNG).

## Pièges connus

- **Salon des jeux** : la liste des joueurs est dans l'onglet **Équipe**, pas dans Jouer ;
  l'onglet Jouer montre « N à la table ». L'onglet choisi est gardé dans `sessionStorage`.
- **Capture pleine page** : la barre d'onglets est fixe en bas de l'écran ; sur une capture
  `fullPage`, elle apparaît au milieu de la page. Ce n'est pas un bug.
- **Jeux ouverts** : la démo ouvre les jeux pour un an et met l'Happy Hour toute la journée
  (Jack-Pot jouable). Sur un autre établissement, `games_open_until` peut les fermer.
- **Parties en mémoire** : redémarrer le serveur termine les parties. Une table pleine (10
  joueurs) ou un pseudo déjà pris à la table renvoie une erreur : varier les pseudos.
- **Nettoyage** : les parties disparaissent avec le serveur ; pour remettre la démo à zéro
  (bons, records, réglages modifiés), relancer `npm run seed:demo`. Ne jamais committer les
  scripts ni les captures de `test/scratch/`.
