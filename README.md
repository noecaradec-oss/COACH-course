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

1. **Profil** : âge, pratique, volume, jours disponibles, fréquence cardiaque.
2. **Évaluation** : course récente, demi-Cooper ou VAMEVAL → VMA, allures, zones.
3. **Objectif** : premier 5 km, piste, route, cross ou trail, avec contrôle de réalisme.
4. **Plan** : phases base / spécifique / affûtage, séance par séance.
5. **Journal** : import de fichiers .fit ou saisie, ressenti de 0 à 10.
6. **Suivi** : kilométrage, charge, équilibre des intensités, alertes.

Tout est stocké dans le navigateur (IndexedDB). L'onglet Profil permet de
télécharger et de restaurer une sauvegarde.

## Installer sur téléphone

Publiez le dossier `dist/` sur un hébergement en HTTPS, ouvrez l'adresse sur le
téléphone, puis « Ajouter à l'écran d'accueil » (Safari) ou « Installer
l'application » (Chrome). L'appli fonctionne ensuite hors ligne.

## Organisation

- `src/domaine` : calculs d'entraînement, sans interface. Chaque règle cite sa source en commentaire.
- `src/donnees` : stockage local (IndexedDB) et sauvegarde.
- `src/fit` : lecture des fichiers .fit avec le SDK officiel Garmin.
- `src/ui` : écrans.

## Licence du SDK Garmin

`@garmin/fitsdk` est distribué sous la licence du protocole FIT de Garmin
(voir `node_modules/@garmin/fitsdk/LICENSE.txt`). À lire avant de distribuer l'appli.
