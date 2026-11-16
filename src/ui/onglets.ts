export type Onglet = 'aujourdhui' | 'plan' | 'journal' | 'suivi' | 'profil'

export const ONGLETS: { id: Onglet; nom: string }[] = [
  { id: 'aujourdhui', nom: 'Aujourd’hui' },
  { id: 'plan', nom: 'Plan' },
  { id: 'journal', nom: 'Journal' },
  { id: 'suivi', nom: 'Bilan' },
  { id: 'profil', nom: 'Profil' },
]
