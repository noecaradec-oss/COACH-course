import { type FormEvent, useState } from 'react'
import { NOMS_JOURS } from '../domaine/dates'
import { fcMaxEstimee } from '../domaine/fc'
import { determinerNiveau } from '../domaine/niveau'
import { type JourSemaine, type Profil, type Sexe, VERSION_DONNEES } from '../domaine/modele'
import { Champ, Message } from './composants'
import { useCoach } from './Etat'

function nombre(texte: string): number | null {
  const n = Number(texte.replace(',', '.'))
  return texte.trim() !== '' && Number.isFinite(n) ? n : null
}

export function FormulaireProfil({ libelleBouton, apresEnregistrement }: { libelleBouton: string; apresEnregistrement?: () => void }) {
  const { profil, majProfil, jour } = useCoach()
  const annee = Number(jour.slice(0, 4))
  const [prenom, setPrenom] = useState(profil?.prenom ?? '')
  const [naissance, setNaissance] = useState(profil ? String(profil.anneeNaissance) : '')
  const [sexe, setSexe] = useState<Sexe | ''>(profil?.sexe ?? '')
  const [pratique, setPratique] = useState(profil ? String(profil.anneesPratique) : '')
  const [volume, setVolume] = useState(profil ? String(profil.volumeHebdoKm) : '')
  const [jours, setJours] = useState<JourSemaine[]>(profil?.joursDisponibles ?? [1, 3, 6])
  const [fcMax, setFcMax] = useState(profil?.fcMax ? String(profil.fcMax) : '')
  const [fcRepos, setFcRepos] = useState(profil?.fcRepos ? String(profil.fcRepos) : '')
  const [blessures, setBlessures] = useState(profil?.blessures ?? '')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  const anneeNaissance = nombre(naissance)
  const age = anneeNaissance ? annee - anneeNaissance : null

  function basculer(jourSemaine: JourSemaine) {
    setJours((j) => (j.includes(jourSemaine) ? j.filter((x) => x !== jourSemaine) : [...j, jourSemaine].sort((a, b) => a - b)))
  }

  async function valider(e: FormEvent) {
    e.preventDefault()
    setEnregistre(false)
    const vol = nombre(volume) ?? 0
    const ans = nombre(pratique) ?? 0
    const max = nombre(fcMax)
    const repos = nombre(fcRepos)
    if (!anneeNaissance || age === null || age < 10 || age > 100) return setErreur('Indiquez votre année de naissance (4 chiffres).')
    if (jours.length === 0) return setErreur('Choisissez au moins un jour d’entraînement.')
    if (vol < 0 || vol > 300) return setErreur('Le volume hebdomadaire semble incorrect.')
    if (max !== null && (max < 120 || max > 230)) return setErreur('La FC max doit être comprise entre 120 et 230.')
    if (repos !== null && (repos < 25 || repos > 110)) return setErreur('La FC de repos doit être comprise entre 25 et 110.')
    if (max !== null && repos !== null && repos >= max) return setErreur('La FC de repos doit être inférieure à la FC max.')
    setErreur(null)
    const nouveau: Profil = {
      id: 'moi',
      version: VERSION_DONNEES,
      prenom: prenom.trim(),
      anneeNaissance,
      anneesPratique: ans,
      volumeHebdoKm: vol,
      joursDisponibles: jours,
      blessures: blessures.trim(),
      niveau: profil?.niveau ?? determinerNiveau(ans, vol, false),
      blessureRecente: profil?.blessureRecente ?? false,
      alerteSante: profil?.alerteSante ?? false,
      materiel: profil?.materiel ?? { gps: false, cardio: false },
      terrains: profil?.terrains ?? { piste: true, cotes: true, chemins: true },
      ...(sexe ? { sexe } : {}),
      ...(max !== null ? { fcMax: max } : {}),
      ...(repos !== null ? { fcRepos: repos } : {}),
    }
    await majProfil(nouveau)
    setEnregistre(true)
    apresEnregistrement?.()
  }

  return (
    <form onSubmit={valider} className="formulaire">
      <Champ libelle="Prénom">
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} autoComplete="given-name" />
      </Champ>
      <div className="deux-colonnes">
        <Champ libelle="Année de naissance">
          <input inputMode="numeric" value={naissance} onChange={(e) => setNaissance(e.target.value)} placeholder="1990" required />
        </Champ>
        <Champ libelle="Sexe" aide="Facultatif. Sert au calcul de la charge par la FC.">
          <select value={sexe} onChange={(e) => setSexe(e.target.value as Sexe | '')}>
            <option value="">Non précisé</option>
            <option value="femme">Femme</option>
            <option value="homme">Homme</option>
          </select>
        </Champ>
      </div>
      <div className="deux-colonnes">
        <Champ libelle="Années de course régulière" aide="0 si vous débutez.">
          <input inputMode="decimal" value={pratique} onChange={(e) => setPratique(e.target.value)} placeholder="0" />
        </Champ>
        <Champ libelle="Km par semaine en ce moment" aide="Moyenne des dernières semaines.">
          <input inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="0" />
        </Champ>
      </div>
      <fieldset className="champ">
        <legend className="champ-libelle">Jours où vous pouvez courir</legend>
        <div className="jours">
          {NOMS_JOURS.map((nom, i) => (
            <button key={nom} type="button" className={jours.includes(i as JourSemaine) ? 'jour jour-actif' : 'jour'} aria-pressed={jours.includes(i as JourSemaine)} onClick={() => basculer(i as JourSemaine)}>
              {nom.slice(0, 3)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="deux-colonnes">
        <Champ libelle="FC max (bpm)" aide={age !== null && age > 0 ? `Si vous ne la connaissez pas : estimée à ${fcMaxEstimee(age)}, à ±10 près.` : 'Facultatif.'}>
          <input inputMode="numeric" value={fcMax} onChange={(e) => setFcMax(e.target.value)} />
        </Champ>
        <Champ libelle="FC de repos (bpm)" aide="Facultatif. Au réveil, allongé.">
          <input inputMode="numeric" value={fcRepos} onChange={(e) => setFcRepos(e.target.value)} />
        </Champ>
      </div>
      <Champ libelle="Blessures ou problèmes de santé" aide="Facultatif. Le plan vous rappellera d’être prudent.">
        <textarea value={blessures} onChange={(e) => setBlessures(e.target.value)} rows={2} />
      </Champ>
      {erreur && <Message type="erreur">{erreur}</Message>}
      {enregistre && <Message type="succes">Profil enregistré.</Message>}
      <button type="submit" className="bouton bouton-principal">
        {libelleBouton}
      </button>
    </form>
  )
}
