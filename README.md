# Coach Course

Appli web de coaching course à pied, installable sur téléphone.
Les données restent sur l'appareil : pas de compte, pas de serveur.

## Commandes

```bash
npm install      # dépendances
npm run dev      # appli en local
npm test         # tests des calculs
npm run build    # version à publier (dossier dist/)
```

## Ce que fait l'appli

1. **Questionnaire** : 25 questions au plus, une par écran. Il en sort un niveau, un VDOT estimé, un volume de départ et les jours d'entraînement, avec un conseil de consulter en cas de blessure récente ou de signal de santé.
2. **Plan** : phases foncier / spécifique / affûtage, jusqu'à 24 semaines, construit en piochant dans une base de 186 séances. Il se réajuste, sur proposition, d'après les séances manquées et le ressenti réel.
3. **Séance du jour** : une touche pour commencer, déroulé étape par étape lisible en plein soleil, compte à rebours, conseil adapté.
4. **Ressenti** : de 1 à 10, en deux touches, puis badges et série de semaines.
5. **Journal** : import de fichiers .fit (SDK officiel Garmin) ou saisie.
6. **Tableau de bord** : volume, charge, répartition des intensités, ressenti prévu et réel, évolution du niveau, régularité. Export CSV et PDF, prévu et réalisé côte à côte.

Tout est stocké dans le navigateur (IndexedDB). L'onglet Profil permet de
télécharger et de restaurer une sauvegarde.

## Installer sur téléphone

Publiez le dossier `dist/` sur un hébergement en HTTPS, ouvrez l'adresse sur le
téléphone, puis « Ajouter à l'écran d'accueil » (Safari) ou « Installer
l'application » (Chrome). L'appli fonctionne ensuite hors ligne.

## Organisation

- `docs/architecture.md` : vue d'ensemble, sans code.
- `src/domaine` : calculs d'entraînement, sans interface. Chaque règle cite sa source en commentaire.
- `src/donnees` : stockage local (IndexedDB), sauvegarde, conversion des anciennes données, exports CSV et PDF.
- `src/donnees/seances.json` : la base de séances, fabriquée par `node scripts/generer-seances.mjs`.
- `src/fit` : lecture des fichiers .fit avec le SDK officiel Garmin.
- `src/ui` : écrans.

## Licence du SDK Garmin

`@garmin/fitsdk` est distribué sous la licence du protocole FIT de Garmin
(voir `node_modules/@garmin/fitsdk/LICENSE.txt`). À lire avant de distribuer l'appli.
