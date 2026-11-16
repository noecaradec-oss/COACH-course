// Un conseil par séance, choisi selon la séance et le contexte du moment.
// Les conseils généraux relèvent de la pratique d'entraîneur ; ceux qui
// s'appuient sur une publication la citent.

import { joursEntre } from './dates'
import type { Activite, Objectif, Phase, Plan, Profil, SeancePrevue, TypeSeance } from './modele'

export interface ContexteConseil {
  phase: Phase
  semaineAllegee: boolean
  joursAvantCourse: number | null
  blessureRecente: boolean
  /** Écart entre ressenti réel et ressenti visé à la séance précédente (positif = plus dur que prévu). */
  ecartRpePrecedent: number | null
  /** Nombre de séances de ce type déjà réalisées. */
  dejaFaitesDuType: number
}

const PAR_TYPE: Record<TypeSeance, string[]> = {
  endurance: [
    'Si vous ne pouvez plus parler en phrases complètes, vous allez trop vite : ralentissez sans regret.',
    'Un footing lent n’est jamais perdu : c’est lui qui construit l’endurance et vous laisse frais pour les séances dures.',
    'Commencez plus lentement que vous ne le pensez nécessaire ; l’allure viendra toute seule après 10 minutes.',
  ],
  sortieLongue: [
    // Apport de glucides pendant l'effort long : 30 à 60 g par heure au-delà d'environ 75 min
    // (Thomas, Erdman & Burke, 2016, position de l'ACSM sur la nutrition du sportif).
    'Au-delà de 75 minutes, emportez à boire et de quoi manger : 30 à 60 g de glucides par heure aident à tenir.',
    'Partez franchement lentement. Une sortie longue réussie se termine en ayant envie de continuer.',
    'Profitez-en pour tester la tenue, les chaussures et le ravitaillement du jour J.',
  ],
  seuil: [
    'Calez la première fraction légèrement en dedans : la dernière doit ressembler à la première.',
    'Le seuil est « confortablement difficile » : quelques mots possibles, pas une phrase. Si vous êtes à bout, c’est trop vite.',
    'Respirez régulièrement et relâchez les épaules ; la régularité compte plus que la vitesse.',
  ],
  allureSpecifique: [
    'C’est une répétition générale : même tenue, même ravitaillement, même petit-déjeuner qu’en course.',
    'L’allure doit vous paraître facile au début. Ne cédez pas à l’envie d’accélérer.',
  ],
  vmaLongue: [
    'Visez la régularité : si une répétition est plus lente de 5 secondes que la première, arrêtez là, le travail est fait.',
    'Ne sprintez pas la première répétition. L’effort doit être dur à partir de la moitié de chacune.',
    'Trottinez vraiment lentement en récupération : elle fait partie de la séance.',
  ],
  vmaCourte: [
    'Sur les deux premières répétitions, retenez-vous : le cœur met du temps à monter.',
    'Gardez la même distance à chaque effort ; si elle baisse nettement, arrêtez la série.',
  ],
  vitesse: [
    'Vite et relâché : mâchoire détendue, épaules basses. Si le geste se crispe, récupérez plus longtemps.',
    'La récupération complète n’est pas du temps perdu : c’est elle qui permet de courir vite proprement.',
  ],
  cotes: [
    'Regard loin devant, pas courts, bras actifs. Redescendez doucement : c’est en descente qu’on se blesse.',
    'Choisissez une pente régulière de 5 à 8 % ; trop raide, vous perdez la foulée.',
  ],
  fartlek: [
    'Laissez la montre de côté : accélérez au ressenti, d’un arbre à un virage, et amusez-vous.',
    'Les parties lentes doivent être vraiment lentes, pour que les parties rapides soient franches.',
  ],
  renfo: ['Privilégiez la qualité du mouvement au nombre de répétitions. Arrêtez un exercice qui fait mal.'],
  educatifs: ['Faites les éducatifs frais, sur terrain plat, en cherchant la qualité : grand, gainé, pied actif.'],
  recuperation: ['Aujourd’hui, plus c’est lent, mieux c’est. Si vous hésitez entre deux allures, prenez la plus lente.'],
  marcheCourse: [
    'Les phases de marche font partie du programme : elles ne sont pas un échec, elles vous font durer.',
    'Courez assez lentement pour pouvoir parler. La vitesse viendra plus tard.',
    'Si la séance vous paraît trop dure, refaites celle de la semaine précédente : personne ne vous chronomètre.',
  ],
  affutage: ['Vous devez finir avec l’envie d’en faire plus. Le travail est fait, il reste à arriver frais.'],
  course: ['Partez prudemment : le premier tiers doit sembler facile. On ne gagne pas de temps au début, on en perd à la fin.'],
}

/** Rassemble le contexte d'une séance à partir du plan et du journal. */
export function contexteDe(seance: SeancePrevue, plan: Plan, activites: Activite[], profil: Profil, objectif: Objectif | null): ContexteConseil {
  const semaine = plan.semaines.find((s) => s.seances.some((x) => x.id === seance.id))
  const prevues = new Map(plan.semaines.flatMap((s) => s.seances).map((s) => [s.id, s]))
  // Dernière séance du plan réalisée avant celle-ci, avec un ressenti noté.
  const precedente = activites
    .filter((a) => a.date < seance.date && a.rpe !== undefined && a.seanceId && prevues.has(a.seanceId))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  return {
    phase: semaine?.phase ?? 'base',
    semaineAllegee: semaine?.allegee ?? false,
    joursAvantCourse: objectif ? joursEntre(seance.date, objectif.date) : null,
    blessureRecente: profil.blessureRecente,
    ecartRpePrecedent: precedente ? precedente.rpe! - prevues.get(precedente.seanceId!)!.rpeVise : null,
    dejaFaitesDuType: activites.filter((a) => a.seanceId && a.seanceId !== seance.id && prevues.get(a.seanceId)?.type === seance.type).length,
  }
}

/** Le conseil du jour. Les situations particulières passent avant le conseil du type de séance. */
export function conseilPour(seance: SeancePrevue, c: ContexteConseil): string {
  if (seance.type === 'course') return PAR_TYPE.course[0]
  if (c.blessureRecente && seance.categorie !== 'facile') {
    return 'Vous sortez d’une blessure : à la moindre douleur qui modifie votre foulée, transformez la séance en footing ou arrêtez-vous.'
  }
  if (c.joursAvantCourse !== null && c.joursAvantCourse >= 1 && c.joursAvantCourse <= 3) {
    return 'La course approche : rien de ce que vous ferez aujourd’hui ne vous rendra plus fort, mais trop en faire peut vous fatiguer. Restez sage.'
  }
  if (c.ecartRpePrecedent !== null && c.ecartRpePrecedent >= 2) {
    return seance.categorie === 'facile'
      ? 'Votre dernière séance a été plus dure que prévu : courez dans le bas de la fourchette, l’objectif du jour est de récupérer.'
      : 'Votre dernière séance a été plus dure que prévu : si les jambes ne répondent pas à l’échauffement, prenez la variante plus facile.'
  }
  if (c.semaineAllegee) return 'Semaine allégée : c’est elle qui transforme le travail en progrès. Ne compensez pas en allant plus vite.'
  if (c.dejaFaitesDuType === 0 && seance.categorie !== 'facile') {
    return `Première séance de ce type : découvrez l’effort sans chercher la performance. ${PAR_TYPE[seance.type][0]}`
  }
  const liste = PAR_TYPE[seance.type]
  return liste[c.dejaFaitesDuType % liste.length]
}
