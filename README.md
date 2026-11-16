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

## Organisation

- `src/domaine` : calculs d'entraînement, sans interface. Chaque règle cite sa source en commentaire.
- `src/donnees` : stockage local (IndexedDB) et sauvegarde.
- `src/fit` : lecture des fichiers .fit avec le SDK officiel Garmin.
- `src/ui` : écrans.

## Licence du SDK Garmin

`@garmin/fitsdk` est distribué sous la licence du protocole FIT de Garmin
(voir `node_modules/@garmin/fitsdk/LICENSE.txt`). À lire avant de distribuer l'appli.
