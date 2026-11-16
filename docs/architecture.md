# Coach Course — architecture

Document de validation, sans code. Les termes techniques sont expliqués entre parenthèses à leur première apparition.

## 1. Les modules

L'appli est une PWA (un site web qui s'installe sur le téléphone comme une appli et fonctionne hors ligne). Tout tourne sur l'appareil : pas de compte, pas de serveur.

```
┌──────────────────────────── ÉCRANS ────────────────────────────┐
│ Questionnaire · Aujourd'hui · Séance · Ressenti · Plan ·       │
│ Journal · Tableau de bord · Profil                              │
└───────────────┬────────────────────────────────┬───────────────┘
                │ demandent un calcul            │ lisent et enregistrent
┌───────────────▼───────────────┐   ┌────────────▼───────────────┐
│ MOTEUR D'ENTRAÎNEMENT         │   │ STOCKAGE SUR L'APPAREIL     │
│ (calculs purs, tous testés)   │   │ IndexedDB (la base de       │
│                               │   │ données intégrée au         │
│ Profil      questionnaire →   │   │ navigateur)                 │
│             niveau, VDOT      │   │ + sauvegarde en un fichier  │
│ Allures     VDOT → min/km,    │   └────────────▲───────────────┘
│             zones cardiaques  │                │
│ Planification  profil + base  │   ┌────────────┴───────────────┐
│             de séances → plan │   │ ENTRÉES ET SORTIES          │
│ Réajustement  ressenti réel,  │   │ Import .fit (SDK Garmin, le │
│             séances manquées  │   │ lecteur officiel du format  │
│ Suivi       charge, alertes,  │   │ des montres)                │
│             prévu / réalisé   │   │ Export CSV (tableur) et PDF │
│ Motivation  badges, séries    │   └────────────────────────────┘
└───────────────▲───────────────┘
                │ pioche dedans
┌───────────────┴───────────────┐
│ BASE DE SÉANCES               │
│ 150+ fiches, fichier JSON     │
│ (un format texte structuré)   │
└───────────────────────────────┘
```

Principe : les écrans ne contiennent aucune règle d'entraînement. Toutes les règles sont dans le moteur, chacune avec sa source (auteur, année), et chacune vérifiée par un test automatique.

## 2. Les données

| Donnée | Ce qu'elle contient | D'où elle vient | À quoi elle sert |
|---|---|---|---|
| **Coureur** (profil) | Âge, sexe (facultatif), années de pratique, volume actuel, jours et durée disponibles, matériel, terrains, blessures, fréquences cardiaques, niveau (1 à 3) | Questionnaire | Dimensionner le plan |
| **Évaluation** | Date, type (course, demi-Cooper, VAMEVAL, allure de footing), VDOT (indice de niveau de Daniels), VMA | Questionnaire, puis chaque nouveau chrono | Calculer les allures |
| **Objectif** | Type (premier 5 km, piste, route, cross, trail), distance, dénivelé, date, temps visé | Questionnaire | Choisir phases et séances |
| **Fiche de séance** | Type, niveau, objectif, échauffement / corps / retour au calme, allures, RPE visé (ressenti attendu, de 1 à 10), durée, variantes, source | Base de séances, fournie avec l'appli | Matière première du plan |
| **Plan** | Semaines (phase, volume, allégée ou non) et séances prévues, chacune tirée d'une fiche et datée | Moteur de planification | Dire quoi faire chaque jour |
| **Réalisé** (activité) | Date, distance, durée, fréquence cardiaque, dénivelé, tours, RPE ressenti, commentaire, lien vers la séance prévue | Import .fit ou saisie | Suivi, réajustement, badges |

Les badges, les séries et les graphiques ne sont pas stockés : ils sont recalculés à partir du réalisé. Les allures ne sont pas stockées non plus : elles suivent toujours la dernière évaluation.

## 3. Les écrans (8)

1. **Questionnaire** — premier lancement. Une question par écran, barre de progression, 25 questions au plus. Sortie : niveau, VDOT estimé, volume de départ, jours possibles. Une blessure récente ou un signal de santé affiche le conseil de consulter.
2. **Aujourd'hui** — écran d'ouverture. La séance du jour, son conseil, la série en cours, le dernier badge. Un bouton : « Commencer ».
3. **Séance** — déroulé étape par étape, en très gros caractères et fort contraste : durée ou distance, allure, compte à rebours, étape suivante.
4. **Ressenti** — en fin de séance : curseur de 1 à 10 avec la description de chaque niveau, puis les badges gagnés.
5. **Plan** — l'objectif, le temps réaliste, les semaines par phase (foncier, spécifique, affûtage), la proposition de réajustement quand le réalisé s'écarte du prévu.
6. **Journal** — import des fichiers .fit, saisie manuelle, liste des séances avec le prévu en regard.
7. **Tableau de bord** — 6 graphiques : volume, charge, répartition des intensités, RPE prévu et réalisé, évolution du VDOT, régularité. Export CSV et PDF.
8. **Profil** — réponses modifiables, nouvelle évaluation, allures, zones, badges, sauvegarde, sources.

Chemin le plus court vers la séance du jour : ouvrir l'appli (elle s'ouvre sur « Aujourd'hui »), toucher « Commencer ». Une touche.

## 4. Points à valider

- **Réajustement proposé, pas imposé** : l'appli explique pourquoi elle veut modifier le plan et attend votre accord.
- **Séries comptées par semaine, pas par jour** : un jour de repos ne casse jamais une série. Une série quotidienne pousserait à courir blessé.
- **Modèles débattus** : le ratio de charge aiguë / chronique (ACWR) n'est pas utilisé pour décider, car sa valeur prédictive est contestée (Impellizzeri et al., 2020).
- **PDF sans bibliothèque** : l'export PDF est écrit à la main (texte et tableaux, pas de graphiques), pour ne rien ajouter aux dépendances.
