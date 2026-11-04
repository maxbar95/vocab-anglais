// =====================================================
//  Ma progression : tout ce que le site retient
//  dans le navigateur (propre à chaque personne).
//  ⚠️ Les MOTS ne sont pas ici : ils sont dans mots.js.
// =====================================================

const CLE_RECORD = "pingpong-vocab-record";
const CLE_SON = "pingpong-vocab-son";
const CLE_STATS = "pingpong-vocab-stats";
const CLE_REGLAGES = "pingpong-vocab-reglages";
const CLE_JOURS = "pingpong-vocab-jours";
const CLE_POINTS = "pingpong-vocab-points";
const CLE_THEME = "pingpong-vocab-theme";

// Lire / écrire dans la mémoire du navigateur, sans planter si elle est bloquée
function lire(cle, defaut) {
  try {
    const texte = localStorage.getItem(cle);
    return texte === null ? defaut : JSON.parse(texte);
  } catch (e) {
    return defaut;
  }
}

function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {}
}

// ---------- Réglages du quiz (sens, longueur, chrono) ----------
const reglages = Object.assign({ sens: "ping-pong", longueur: "20", chrono: "non" }, lire(CLE_REGLAGES, {}));

function sauverReglages() {
  ecrire(CLE_REGLAGES, reglages);
}

// ---------- Statistiques de chaque mot ----------
// Pour chaque mot (repéré par son mot anglais), on retient :
//   bons / rates : nombre de bonnes et de mauvaises réponses
//   difficulte   : 0 = facile. +2 quand je rate, -1 quand je réussis (sert au « 🧠 à revoir »)
//   palier       : où en est le mot dans les écarts de révision (-1 = au tout début)
//   prochaine    : date de la prochaine révision ("2026-11-04"), null = jamais vu
const DIFFICULTE_MAX = 6;
const stats = lire(CLE_STATS, {}) || {};

function statsDe(en) {
  // Les valeurs par défaut servent aux mots jamais vus (ou ajoutés plus tard à la liste)
  return Object.assign({ bons: 0, rates: 0, difficulte: 0, palier: -1, prochaine: null }, stats[en]);
}

// ---------- Révision espacée ----------
// Écarts en jours après chaque réussite : 1 jour, puis 3, 7, 14 et 30 jours.
const ECARTS = [1, 3, 7, 14, 30];

// Le mot doit-il être révisé aujourd'hui (ou était-il déjà en retard) ?
function estAReviser(en) {
  const prochaine = statsDe(en).prochaine;
  return prochaine !== null && prochaine <= dateDuJour();
}

// Nombre de jours entre aujourd'hui et une date ("2026-11-07" → 3)
function joursAvant(date) {
  const debut = new Date(dateDuJour() + "T00:00:00");
  const fin = new Date(date + "T00:00:00");
  return Math.round((fin - debut) / 86400000);
}

// resultat : "bon", "indice" (bon avec l'indice) ou "faux" (temps écoulé compris)
function noterReponse(en, resultat) {
  const s = statsDe(en);
  // Un mot posé AVANT sa date (pour compléter un quiz) ne monte pas de palier :
  // sinon il grimperait jusqu'à 30 jours en quelques jours seulement.
  const etaitPrevu = s.prochaine === null || s.prochaine <= dateDuJour();

  if (resultat === "bon") {
    s.bons++;
    s.difficulte = Math.max(0, s.difficulte - 1);
    if (etaitPrevu) {
      s.palier = Math.min(s.palier + 1, ECARTS.length - 1); // écart suivant (30 jours au maximum)
      s.prochaine = dateDuJour(ECARTS[s.palier]);
    }
  } else if (resultat === "indice") {
    // Trouvé avec l'aide : pas de nouveau palier, il revient demain
    s.bons++;
    if (etaitPrevu) s.prochaine = dateDuJour(1);
  } else {
    // Raté : retour au début, et il revient dès aujourd'hui
    s.rates++;
    s.difficulte = Math.min(DIFFICULTE_MAX, s.difficulte + 2);
    s.palier = -1;
    s.prochaine = dateDuJour();
  }
  stats[en] = s;
  ecrire(CLE_STATS, stats);
}

// ---------- Série de jours ----------
// On retient le dernier jour où un quiz a été terminé, et la série en cours.

// Date du jour au format "2026-11-04" (heure de l'ordinateur)
function dateDuJour(decalage = 0) {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// Renvoie { serie, faitAujourdhui }. La série tombe à 0 si un jour a été sauté.
function infosJours() {
  const j = lire(CLE_JOURS, null);
  if (!j) return { serie: 0, faitAujourdhui: false };
  if (j.dernier === dateDuJour()) return { serie: j.serie, faitAujourdhui: true };
  if (j.dernier === dateDuJour(-1)) return { serie: j.serie, faitAujourdhui: false };
  return { serie: 0, faitAujourdhui: false };
}

// À appeler à la fin de chaque quiz. Renvoie { serie, augmentee }.
function noterQuizDuJour() {
  const avant = infosJours();
  if (avant.faitAujourdhui) return { serie: avant.serie, augmentee: false };
  const serie = avant.serie + 1;
  ecrire(CLE_JOURS, { dernier: dateDuJour(), serie });
  return { serie, augmentee: true };
}

// ---------- Points cumulés et badges ----------
// Un quiz de 20 mots rapporte environ 10 à 20 points.
const BADGES = [
  { nom: "Stagiaire",      emoji: "🔩", seuil: 0 },
  { nom: "Apprenti",       emoji: "🔧", seuil: 100 },   // ~ 7 quiz
  { nom: "Compagnon",      emoji: "🛠️", seuil: 500 },   // ~ 35 quiz
  { nom: "Chef d'atelier", emoji: "👷", seuil: 1500 },  // ~ 100 quiz : l'objectif de l'année
];

function pointsCumules() {
  return Number(lire(CLE_POINTS, 0)) || 0;
}

function ajouterPoints(n) {
  const total = pointsCumules() + n;
  ecrire(CLE_POINTS, total);
  return total;
}

// Le badge obtenu avec ce nombre de points
function badgePour(points) {
  return BADGES.filter((b) => points >= b.seuil).pop();
}

// Le prochain badge à gagner (ou null si tout est gagné)
function badgeSuivant(points) {
  return BADGES.find((b) => points < b.seuil) || null;
}

// ---------- Mots réussis ----------
// Un mot compte comme « réussi » dès que je l'ai trouvé au moins une fois.
function nbMotsReussis(liste) {
  return liste.filter((m) => statsDe(m.en).bons > 0).length;
}

// État d'un mot pour la page « Ma liste »
function etatDuMot(en) {
  const s = statsDe(en);
  if (s.difficulte > 0) return "difficile";
  if (s.bons > 0) return "reussi";
  return "nouveau";
}

// ---------- Mode sombre ----------
// Sans choix enregistré, on suit le réglage de l'ordinateur / du téléphone.
function themeActuel() {
  const choix = lire(CLE_THEME, null);
  if (choix === "dark" || choix === "light") return choix;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function appliquerTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function changerTheme() {
  const nouveau = themeActuel() === "dark" ? "light" : "dark";
  ecrire(CLE_THEME, nouveau);
  appliquerTheme(nouveau);
  return nouveau;
}

// Appliqué tout de suite (ce fichier est chargé en haut de la page) pour éviter un « flash » blanc
appliquerTheme(themeActuel());

// ---------- Record ----------
function lireRecord() {
  return lire(CLE_RECORD, null);
}

function sauverRecord(score, total) {
  ecrire(CLE_RECORD, { score, total });
}
