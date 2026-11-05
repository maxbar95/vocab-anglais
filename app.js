// =====================================================
//  Ping-Pong Vocab — le « cerveau » du site
// =====================================================

const POINTS_INDICE = 0.5; // une bonne réponse avec l'indice rapporte 0,5 point au lieu de 1

// Petit raccourci pour attraper un élément de la page
const $ = (id) => document.getElementById(id);

// =====================================================
//  Lecture de la liste de mots (fichier mots.js)
// =====================================================

// Chaque mot retient son cours : c'est le dernier titre « # --- Cours 3 --- » placé au-dessus de lui
function lireListe(texte) {
  const resultat = [];
  const dejaVus = new Set();
  let cours = null;
  texte.split("\n").forEach((ligne) => {
    ligne = ligne.trim();
    const titre = ligne.match(/^#\s*-{2,}\s*(.+?)\s*-{2,}\s*$/);
    if (titre) { cours = titre[1]; return; }
    if (!ligne || ligne.startsWith("#") || !ligne.includes("=")) return;
    const position = ligne.indexOf("=");
    const en = nettoyer(ligne.slice(0, position));
    const fr = nettoyer(ligne.slice(position + 1));
    if (!en || !fr || dejaVus.has(en)) return; // ligne vide ou doublon : ignorée
    dejaVus.add(en);
    resultat.push({ en, fr, cours });
  });
  return resultat;
}

// =====================================================
//  Vérification des réponses
// =====================================================

// Met en forme : minuscules, espaces en trop retirés, apostrophes unifiées
function nettoyer(texte) {
  return texte
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// En français : l'article (le, la, les, l') est facultatif
function sansArticle(texte) {
  return texte.replace(/^(les|le|la)\s+/, "").replace(/^l'\s*/, "");
}

// En anglais : le « to » des verbes est facultatif
function sansTo(texte) {
  return texte.replace(/^to\s+/, "");
}

// Retire les accents (sert seulement à repérer une erreur d'accent)
function sansAccents(texte) {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Renvoie "bon", "accents" (presque, mais accent faux) ou "faux"
function verifier(reponse, attendu, langue) {
  const simplifier = langue === "fr" ? sansArticle : sansTo;
  const r = simplifier(nettoyer(reponse));
  const possibles = attendu.split("/").map((p) => simplifier(nettoyer(p))).filter(Boolean);

  if (possibles.includes(r)) return "bon";
  if (possibles.map(sansAccents).includes(sansAccents(r))) return "accents";
  return "faux";
}

// Affiche "sol/étage" joliment : "sol / étage"
function joli(texte) {
  return texte.split("/").map((t) => t.trim()).join(" / ");
}

// Première lettre de la réponse, sans l'article ni le « to » (pour l'indice)
function premiereLettre(attendu, langue) {
  const simplifier = langue === "fr" ? sansArticle : sansTo;
  return simplifier(nettoyer(attendu.split("/")[0])).charAt(0);
}

// Affiche un nombre de points à la française : 17.5 → "17,5"
function formatPoints(n) {
  return String(n).replace(".", ",");
}

const mots = lireListe(typeof LISTE_DE_MOTS === "string" ? LISTE_DE_MOTS : "");

// =====================================================
//  Sons (créés directement par le navigateur)
// =====================================================

let sonActif = lire(CLE_SON, true) !== false;
let audio = null;

function note(frequence, debut, duree, type = "sine", volume = 0.15) {
  if (!sonActif) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = frequence;
    const t = audio.currentTime + debut;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01); // attaque douce (pas de « clic »)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + duree);
  } catch (e) {}
}

const sons = {
  // « Ding » de clochette : une note aiguë + une harmonique légère
  bon() {
    note(1319, 0, 0.6, "sine", 0.16);
    note(2637, 0, 0.35, "sine", 0.04);
    note(1760, 0.09, 0.7, "sine", 0.12);
  },
  // Son doux qui descend, pas agressif
  faux() { note(392, 0, 0.3, "triangle", 0.09); note(311, 0.14, 0.45, "triangle", 0.09); },
  fin() { [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.13, 0.35)); },
  bip() { note(880, 0, 0.08, "triangle", 0.1); note(1320, 0.08, 0.12, "triangle", 0.1); },
  tic() { note(1000, 0, 0.05, "square", 0.03); },
  // Petite fanfare pour un nouveau badge ou une série
  fanfare() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => note(f, i * 0.11, 0.3, "triangle", 0.12));
    note(1047, 0.7, 0.8, "sine", 0.12);
  },
};

function majBoutonSon() {
  $("btn-son").textContent = sonActif ? "🔊" : "🔇";
}

$("btn-son").addEventListener("click", () => {
  sonActif = !sonActif;
  ecrire(CLE_SON, sonActif);
  majBoutonSon();
});
majBoutonSon();

// =====================================================
//  Voix du robot : lit les mots anglais (accent britannique)
//  Seulement quand on appuie sur 🔊 (même si les bruitages sont coupés).
//  La voix vient du téléphone / de l'ordinateur : gratuite, elle marche aussi sans internet.
// =====================================================

const voixDispo = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
if (!voixDispo) document.documentElement.classList.add("sans-voix"); // les boutons 🔊 sont alors cachés

// Choisit une voix britannique si l'appareil en a une, sinon une autre voix anglaise
function voixAnglaise() {
  const voix = speechSynthesis.getVoices();
  return voix.find((v) => /^en[-_]GB$/i.test(v.lang)) || voix.find((v) => /^en([-_]|$)/i.test(v.lang)) || null;
}

function lireEnAnglais(texte) {
  if (!voixDispo) return;
  speechSynthesis.cancel(); // coupe le mot précédent s'il était encore en train d'être lu
  // "floor/ground" est lu « floor, ground » (petite pause entre les deux)
  const phrase = new SpeechSynthesisUtterance(joli(texte).replace(/\s*\/\s*/g, ", "));
  phrase.lang = "en-GB";
  const voix = voixAnglaise();
  if (voix) phrase.voice = voix;
  phrase.rate = 0.9; // un peu plus lent que la normale, pour bien entendre
  speechSynthesis.speak(phrase);
}

// Certains navigateurs chargent la liste des voix en retard : on la demande dès le début
if (voixDispo) speechSynthesis.getVoices();

// Fabrique un petit bouton 🔊 qui lit un mot anglais
function boutonEcouter(en) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn-ecouter";
  b.textContent = "🔊";
  b.title = "Écouter en anglais";
  b.setAttribute("aria-label", `Écouter « ${joli(en)} » en anglais`);
  b.addEventListener("click", () => lireEnAnglais(en));
  return b;
}

// =====================================================
//  Mode sombre (la logique est dans progression.js)
// =====================================================

function majBoutonTheme() {
  $("btn-theme").textContent = themeActuel() === "dark" ? "☀️" : "🌙";
}

$("btn-theme").addEventListener("click", () => {
  changerTheme();
  majBoutonTheme();
});
majBoutonTheme();

// =====================================================
//  Confettis
// =====================================================

const COULEURS = ["#58cc02", "#1cb0f6", "#ffc800", "#ff4b4b", "#ce82ff", "#ff9600"];

function confettis(nombre, depuisX, depuisY) {
  const zone = $("confettis");
  for (let i = 0; i < nombre; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.background = COULEURS[i % COULEURS.length];
    c.style.left = depuisX + "px";
    c.style.top = depuisY + "px";
    zone.appendChild(c);

    const angle = Math.random() * Math.PI * 2;
    const force = 80 + Math.random() * 220;
    const dx = Math.cos(angle) * force;
    const dy = Math.sin(angle) * force - 120;
    const tourne = Math.random() * 720 - 360;

    const anim = c.animate(
      [
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${tourne / 2}deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx * 1.3}px, ${dy + 380}px) rotate(${tourne}deg)`, opacity: 0 },
      ],
      { duration: 1200 + Math.random() * 800, easing: "cubic-bezier(.2,.7,.4,1)" }
    );
    anim.onfinish = () => c.remove();
  }
}

// =====================================================
//  Navigation entre les écrans
// =====================================================

function afficherEcran(nom) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("ecran-" + nom).classList.add("active");
  window.scrollTo(0, 0);
  if (nom !== "quiz") $("bandeau").classList.remove("visible");
}

// =====================================================
//  Choix du cours (menu « 📚 Cours », visible dès qu'il y a au moins 2 cours)
// =====================================================

// Liste des cours, dans l'ordre du fichier mots.js
const LISTE_COURS = [...new Set(mots.map((m) => m.cours).filter(Boolean))];

// Un cours enregistré qui n'existe plus (renommé dans mots.js) : retour à « tous »
if (!reglages.cours || (reglages.cours !== "tous" && !LISTE_COURS.includes(reglages.cours))) reglages.cours = "tous";

// Les mots du cours choisi (ou tous les mots)
function motsChoisis() {
  if (reglages.cours === "tous") return mots;
  return mots.filter((m) => m.cours === reglages.cours);
}

function remplirMenuCours() {
  const menu = $("choix-cours");
  menu.innerHTML = "";
  const tous = new Option(`Tous les cours (${mots.length} mots)`, "tous");
  menu.add(tous);
  LISTE_COURS.forEach((c) => {
    const n = mots.filter((m) => m.cours === c).length;
    menu.add(new Option(`${c} (${n} mot${n > 1 ? "s" : ""})`, c));
  });
  menu.value = reglages.cours;
  $("reglage-cours").hidden = LISTE_COURS.length < 2;
}

$("choix-cours").addEventListener("change", () => {
  reglages.cours = $("choix-cours").value;
  sauverReglages();
  majAccueil();
});

// Nombre de mots dans un quiz, selon le réglage « Longueur »
function tailleQuiz() {
  const dispo = motsChoisis().length;
  if (reglages.longueur === "tous") return dispo;
  return Math.min(Number(reglages.longueur) || 20, dispo);
}

function majAccueil() {
  $("nb-mots").textContent = mots.length;
  $("nb-tous").textContent = motsChoisis().length;
  const record = lireRecord();
  $("record").textContent = record ? `${formatPoints(record.score)}/${record.total}` : "–";

  // Compteur « Tu as réussi X mots sur Y »
  const reussis = nbMotsReussis(mots);
  $("nb-reussis").textContent = reussis;
  $("nb-total").textContent = mots.length;
  $("barre-reussis").style.width = (mots.length ? Math.round((reussis / mots.length) * 100) : 0) + "%";

  // Révision espacée : « X mots à réviser aujourd'hui »
  const aReviser = mots.filter((m) => estAReviser(m.en)).length;
  const jamaisVus = mots.filter((m) => statsDe(m.en).prochaine === null).length;
  $("nb-a-reviser").textContent = aReviser;
  $("texte-a-reviser").textContent = aReviser > 1 ? "mots à réviser aujourd'hui" : "mot à réviser aujourd'hui";
  $("nb-jamais-vus").textContent = jamaisVus > 0 ? ` · ${jamaisVus} jamais vu${jamaisVus > 1 ? "s" : ""}` : "";

  const difficiles = mots.filter((m) => statsDe(m.en).difficulte > 0).length;
  $("nb-difficiles").textContent = difficiles;
  $("chip-difficiles").hidden = difficiles === 0;

  // Série de jours
  const jours = infosJours();
  $("nb-jours").textContent = jours.serie;
  $("texte-jours").textContent = jours.serie > 1 ? "jours d'affilée" : "jour d'affilée";
  $("chip-jours").classList.toggle("eteint", !jours.faitAujourdhui);

  // Badge actuel et progression vers le suivant
  const total = pointsCumules();
  const badge = badgePour(total);
  const suivant = badgeSuivant(total);
  $("badge-emoji").textContent = badge.emoji;
  $("badge-nom").textContent = badge.nom;
  if (suivant) {
    const avance = (total - badge.seuil) / (suivant.seuil - badge.seuil);
    $("badge-barre").style.width = Math.round(avance * 100) + "%";
    $("badge-texte").textContent = `${formatPoints(total)} / ${suivant.seuil} pts pour ${suivant.emoji} ${suivant.nom}`;
  } else {
    $("badge-barre").style.width = "100%";
    $("badge-texte").textContent = `${formatPoints(total)} pts · Niveau maximum ! 🏆`;
  }

  // Ce que dit le robot en arrivant
  let phrase = PHRASES_ROBOT[0];
  if (jours.serie > 0 && !jours.faitAujourdhui) phrase = `🔥 ${jours.serie} jour${jours.serie > 1 ? "s" : ""} d'affilée ! Fais un quiz aujourd'hui pour garder ta série.`;
  else if (jours.faitAujourdhui) phrase = "Ta série est assurée pour aujourd'hui, bravo ! 🔥";
  $("bulle-accueil").textContent = phrase;

  // Met en surbrillance les réglages choisis
  document.querySelectorAll(".segments[data-reglage]").forEach((groupe) => {
    groupe.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("choisi", b.dataset.valeur === reglages[groupe.dataset.reglage]));
  });

  if (mots.length === 0) {
    $("btn-commencer").disabled = true;
    $("info-quiz").textContent = "La liste de mots est vide (fichier mots.js).";
  } else {
    $("btn-commencer").disabled = false;
    $("info-quiz").textContent = reglages.cours === "tous"
      ? "📅 Le quiz commence par les mots à réviser aujourd'hui."
      : `📚 Quiz sur « ${reglages.cours} » seulement, en commençant par les mots à réviser.`;
  }
}

// Clic sur un réglage (sens, longueur, chrono) : on le retient et on rafraîchit l'accueil
document.querySelectorAll(".segments[data-reglage]").forEach((groupe) => {
  groupe.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    reglages[groupe.dataset.reglage] = b.dataset.valeur;
    sauverReglages();
    majAccueil();
  });
});

function allerAccueil() {
  arreterChrono();
  majAccueil();
  humeurRobot("robot-accueil", "normal");
  afficherEcran("accueil");
}

$("btn-logo").addEventListener("click", () => {
  if ($("ecran-quiz").classList.contains("active") && !confirm("Quitter le quiz en cours ?")) return;
  allerAccueil();
});
$("btn-commencer").addEventListener("click", demarrerQuiz);
$("btn-mes-mots").addEventListener("click", () => { afficherListe(); afficherEcran("mots"); });
$("btn-retour").addEventListener("click", allerAccueil);
$("btn-rejouer").addEventListener("click", demarrerQuiz);
$("btn-refaire").addEventListener("click", refaireErreurs);
$("btn-accueil").addEventListener("click", allerAccueil);
$("btn-quitter").addEventListener("click", () => {
  if (confirm("Quitter le quiz en cours ?")) allerAccueil();
});

// Le robot de l'accueil parle quand on clique dessus
const PHRASES_ROBOT = [
  "Salut ! Prêt pour un match de vocabulaire ? 🏓",
  "Bip bip ! On révise un peu ? 🤖",
  "Un mot par jour et l'anglais n'aura plus de secret ! 💪",
  "Attention aux accents, je surveille ! 👀",
  "Casque OK, lunettes OK… on peut commencer ! ⛑️",
  "Hey, ça chatouille ! 😄",
];
let phraseActuelle = 0;
let minuterieRobot = null;

$("robot-accueil").addEventListener("click", () => {
  phraseActuelle = (phraseActuelle + 1) % PHRASES_ROBOT.length;
  const bulle = $("bulle-accueil");
  bulle.textContent = PHRASES_ROBOT[phraseActuelle];
  bulle.classList.remove("pop");
  void bulle.offsetWidth;
  bulle.classList.add("pop");
  humeurRobot("robot-accueil", "content");
  clearTimeout(minuterieRobot);
  minuterieRobot = setTimeout(() => humeurRobot("robot-accueil", "normal"), 1500);
  sons.bip();
});

// =====================================================
//  Le quiz
// =====================================================

let quiz = null;

function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Choisit les mots du quiz, dans cet ordre de priorité :
//   1. les mots à réviser aujourd'hui (les plus en retard d'abord)
//   2. les mots jamais vus
//   3. les autres, en commençant par ceux dont la révision est la plus proche
// Chaque mot n'apparaît qu'une fois. À la fin, on mélange pour varier l'ordre.
function tirerMots(nombre) {
  const aReviser = [];
  const jamaisVus = [];
  const plusTard = [];

  // On mélange d'abord : à date égale, l'ordre sera donc aléatoire
  melanger(motsChoisis()).forEach((mot) => {
    const s = statsDe(mot.en);
    if (s.prochaine === null) jamaisVus.push(mot);
    else if (estAReviser(mot.en)) aReviser.push(mot);
    else plusTard.push(mot);
  });

  const parDate = (a, b) => statsDe(a.en).prochaine.localeCompare(statsDe(b.en).prochaine);
  aReviser.sort(parDate);
  plusTard.sort(parDate);

  return melanger([...aReviser, ...jamaisVus, ...plusTard].slice(0, nombre));
}

// Sens de la question n°i selon le réglage choisi
function sensDeLaQuestion(i) {
  if (reglages.sens === "ping-pong") return i % 2 === 0 ? "en-fr" : "fr-en";
  return reglages.sens;
}

function demarrerQuiz() {
  if (motsChoisis().length === 0) return;
  const questions = tirerMots(tailleQuiz()).map((mot, i) => ({ mot, sens: sensDeLaQuestion(i) }));
  lancerQuiz(questions, false);
}

// Repose uniquement les mots ratés, dans le même sens que la première fois
function refaireErreurs() {
  if (!quiz || quiz.erreurs.length === 0) return;
  const questions = melanger(quiz.erreurs.map((e) => ({ mot: e.mot, sens: e.sens })));
  lancerQuiz(questions, true);
}

function lancerQuiz(questions, revision) {
  quiz = {
    questions,
    revision,
    index: 0,
    points: 0,
    serie: 0,
    erreurs: [],
    repondu: false,
    indiceUtilise: false,
  };
  $("serie").classList.remove("visible");
  $("etiquette-revision").hidden = !revision;
  afficherEcran("quiz");
  afficherQuestion();
}

// Bouton Indice : montre la première lettre de la réponse
function donnerIndice() {
  if (!quiz || quiz.repondu || quiz.indiceUtilise) return;
  const q = quiz.questions[quiz.index];
  const attendu = q.sens === "en-fr" ? q.mot.fr : q.mot.en;
  const lettre = premiereLettre(attendu, q.sens === "en-fr" ? "fr" : "en");
  quiz.indiceUtilise = true;
  $("indice-texte").textContent = `💡 Ça commence par « ${lettre} »… (une bonne réponse vaudra 0,5 point)`;
  $("indice-texte").hidden = false;
  $("btn-indice").disabled = true;
  sons.bip();
  $("reponse").focus();
}

$("btn-indice").addEventListener("click", donnerIndice);

// ---------- Chrono : 10 secondes par mot ----------
const DUREE_CHRONO = 10; // secondes
let minuterieChrono = null;

function lancerChrono() {
  arreterChrono();
  const actif = reglages.chrono === "oui";
  $("chrono").hidden = !actif;
  if (!actif) return;

  const fin = Date.now() + DUREE_CHRONO * 1000;
  let derniereSeconde = DUREE_CHRONO;
  $("chrono").classList.remove("urgent");

  minuterieChrono = setInterval(() => {
    const reste = Math.max(0, fin - Date.now());
    const secondes = Math.ceil(reste / 1000);
    $("chrono-sec").textContent = secondes;
    $("chrono-barre").style.width = (reste / (DUREE_CHRONO * 1000)) * 100 + "%";

    // Les 3 dernières secondes : en rouge, avec un tic-tac
    if (secondes <= 3 && secondes !== derniereSeconde) {
      $("chrono").classList.add("urgent");
      if (secondes > 0) sons.tic();
    }
    derniereSeconde = secondes;

    if (reste === 0) {
      arreterChrono();
      validerReponse(true); // temps écoulé
    }
  }, 100);
}

function arreterChrono() {
  clearInterval(minuterieChrono);
  minuterieChrono = null;
}

function afficherQuestion() {
  const q = quiz.questions[quiz.index];
  const total = quiz.questions.length;

  $("compteur").textContent = `${quiz.index + 1}/${total}`;
  $("barre").style.width = (quiz.index / total) * 100 + "%";

  const sens = $("sens");
  if (q.sens === "en-fr") {
    sens.textContent = "🇬🇧 → 🇫🇷 Traduis en français";
    sens.className = "sens";
    $("mot-question").textContent = joli(q.mot.en);
  } else {
    sens.textContent = "🇫🇷 → 🇬🇧 Translate into English";
    sens.className = "sens fr-en";
    $("mot-question").textContent = joli(q.mot.fr);
  }
  // 🔊 sur la carte seulement si le mot affiché est anglais (sinon il donnerait la réponse)
  $("btn-ecouter-carte").hidden = q.sens !== "en-fr";
  $("btn-ecouter-reponse").hidden = true;

  const carte = $("carte");
  carte.className = "carte";
  void carte.offsetWidth; // relance l'animation
  carte.classList.add("nouvelle");
  humeurRobot("robot-quiz", "normal");

  const champ = $("reponse");
  champ.value = "";
  champ.className = "champ";
  champ.disabled = false;
  champ.focus();

  $("btn-verifier").disabled = true;
  $("btn-indice").disabled = false;
  $("indice-texte").hidden = true;
  $("bandeau").classList.remove("visible");
  quiz.repondu = false;
  quiz.indiceUtilise = false;
  lancerChrono();
}

$("reponse").addEventListener("input", () => {
  $("btn-verifier").disabled = $("reponse").value.trim() === "";
});

const BRAVOS = ["Bravo !", "Excellent !", "Super !", "Génial !", "Parfait !", "Bien joué !", "Trop fort !"];

// tempsEcoule = true quand le chrono arrive à 0 : la réponse compte comme fausse
function validerReponse(tempsEcoule = false) {
  if (!quiz || quiz.repondu) return;
  const champ = $("reponse");
  if (!tempsEcoule && champ.value.trim() === "") return;
  arreterChrono();

  const q = quiz.questions[quiz.index];
  const attendu = q.sens === "en-fr" ? q.mot.fr : q.mot.en;
  const langue = q.sens === "en-fr" ? "fr" : "en";
  const resultat = tempsEcoule ? "temps" : verifier(champ.value, attendu, langue);

  quiz.repondu = true;
  champ.disabled = true;
  $("btn-verifier").disabled = true;
  $("btn-indice").disabled = true;

  const bandeau = $("bandeau");
  const carte = $("carte");
  const serie = $("serie");

  if (resultat === "bon") {
    const gain = quiz.indiceUtilise ? POINTS_INDICE : 1;
    quiz.points += gain;
    quiz.serie++;
    noterReponse(q.mot.en, quiz.indiceUtilise ? "indice" : "bon");
    champ.className = "champ bon";
    carte.className = "carte bon";
    bandeau.className = "bandeau bon";
    $("bandeau-titre").textContent = "✅ " + BRAVOS[Math.floor(Math.random() * BRAVOS.length)] + ` +${formatPoints(gain)} pt`;
    const details = [];
    if (quiz.indiceUtilise) details.push("💡 Avec l'indice");
    if (attendu.includes("/")) details.push("Réponses possibles : " + joli(attendu));
    $("bandeau-detail").textContent = details.join(" · ");
    // Toutes les 5 bonnes réponses d'affilée, le robot fait la fête
    if (quiz.serie % 5 === 0) {
      humeurRobot("robot-quiz", "fete");
      sons.fanfare();
    } else {
      humeurRobot("robot-quiz", "content");
      sons.bon();
    }
    const zone = carte.getBoundingClientRect();
    confettis(24, zone.left + zone.width / 2, zone.top + zone.height / 2);
  } else {
    quiz.serie = 0;
    noterReponse(q.mot.en, "faux");
    champ.className = "champ faux";
    carte.className = "carte faux";
    bandeau.className = "bandeau faux";
    $("bandeau-titre").textContent =
      resultat === "temps" ? "⏰ Temps écoulé !" :
      resultat === "accents" ? "😬 Presque ! Attention aux accents" : "❌ Raté !";
    $("bandeau-detail").textContent = "Bonne réponse : " + joli(attendu);
    quiz.erreurs.push({ mot: q.mot, sens: q.sens });
    humeurRobot("robot-quiz", "triste");
    sons.faux();
  }

  // Série de bonnes réponses
  $("serie-nb").textContent = quiz.serie;
  serie.classList.toggle("visible", quiz.serie >= 2);
  serie.classList.remove("pop");
  void serie.offsetWidth;
  if (quiz.serie >= 2) serie.classList.add("pop");

  // Dans le sens 🇫🇷 → 🇬🇧, une fois la réponse donnée, on peut écouter le mot anglais
  $("btn-ecouter-reponse").hidden = q.sens === "en-fr";

  $("barre").style.width = ((quiz.index + 1) / quiz.questions.length) * 100 + "%";
  $("btn-continuer").textContent = quiz.index + 1 < quiz.questions.length ? "Continuer" : "Voir mon score";
  requestAnimationFrame(() => bandeau.classList.add("visible"));
  setTimeout(() => $("btn-continuer").focus(), 50);
}

function questionSuivante() {
  if (!quiz || !quiz.repondu) return;
  quiz.index++;
  if (quiz.index < quiz.questions.length) afficherQuestion();
  else afficherResultat();
}

$("btn-verifier").addEventListener("click", () => validerReponse());
$("btn-continuer").addEventListener("click", questionSuivante);

// Boutons 🔊 du quiz : ils lisent le mot anglais de la question en cours
["btn-ecouter-carte", "btn-ecouter-reponse"].forEach((id) => {
  $(id).addEventListener("click", () => {
    if (quiz) lireEnAnglais(quiz.questions[quiz.index].mot.en);
  });
});
// Sur téléphone : appuyer sur 🔊 de la carte ne doit pas fermer le clavier
$("btn-ecouter-carte").addEventListener("pointerdown", (e) => e.preventDefault());

// Touche Entrée : vérifier, puis continuer
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !$("ecran-quiz").classList.contains("active")) return;
  e.preventDefault();
  if (quiz && quiz.repondu) questionSuivante();
  else validerReponse();
});

// =====================================================
//  Résultats
// =====================================================

function afficherResultat() {
  const { points, erreurs } = quiz;
  const total = quiz.questions.length;
  const ratio = points / total;

  afficherEcran("resultat");

  // Médaille, message et humeur du robot selon le score
  let emoji, message, humeur;
  if (ratio === 1)        { emoji = "🏆"; message = "Parfait, sans faute ! 🤩"; humeur = "fete"; }
  else if (ratio >= 0.8)  { emoji = "🥇"; message = "Excellent travail ! 🔥"; humeur = "fete"; }
  else if (ratio >= 0.6)  { emoji = "🥈"; message = "Bien joué, continue comme ça ! 💪"; humeur = "fete"; }
  else if (ratio >= 0.4)  { emoji = "🥉"; message = "Pas mal ! Encore un petit effort 🙂"; humeur = "content"; }
  else                    { emoji = "🌱"; message = "Chaque quiz te fait progresser, on continue ! 🚀"; humeur = "triste"; }

  // Points cumulés, badge et série de jours
  const avant = pointsCumules();
  const apres = ajouterPoints(points);
  const ancienBadge = badgePour(avant);
  const badge = badgePour(apres);
  const nouveauBadge = badge.seuil > ancienBadge.seuil;
  const jours = noterQuizDuJour();

  $("bilan-points").textContent = formatPoints(points);
  $("bilan-jours").textContent = jours.serie;
  $("bilan-texte-jours").textContent = jours.serie > 1 ? "jours" : "jour";
  $("bilan-badge").textContent = `${badge.emoji} ${badge.nom}`;
  $("nouveau-badge").hidden = !nouveauBadge;
  $("nouveau-badge-emoji").textContent = badge.emoji;
  $("nouveau-badge-nom").textContent = badge.nom;

  // Le robot réagit : nouveau badge > série qui grandit > score
  let bulle = message;
  if (nouveauBadge) {
    humeur = "fete";
    bulle = `Waouh ! Tu es maintenant ${badge.nom} ${badge.emoji} !`;
  } else if (jours.augmentee && jours.serie > 1) {
    humeur = "fete";
    bulle = `🔥 ${jours.serie} jours d'affilée ! Continue comme ça !`;
  } else if (jours.augmentee) {
    bulle = "Premier quiz du jour, c'est parti pour une série ! 🔥";
  }
  $("bulle-resultat").textContent = bulle;
  humeurRobot("robot-resultat", humeur);

  const medaille = $("trophee");
  medaille.textContent = emoji;
  medaille.style.animation = "none";
  void medaille.offsetWidth;
  medaille.style.animation = "";

  $("message-final").textContent = message;
  $("score-total").textContent = "/" + total;

  // Anneau qui se remplit + score qui défile
  const anneau = $("anneau");
  const tour = 2 * Math.PI * 52;
  anneau.style.transition = "none";
  anneau.style.strokeDashoffset = tour;
  anneau.style.stroke = ratio >= 0.6 ? "#58cc02" : ratio >= 0.4 ? "#ffc800" : "#ff9600";
  void anneau.getBoundingClientRect();
  anneau.style.transition = "";
  requestAnimationFrame(() => { anneau.style.strokeDashoffset = tour * (1 - ratio); });

  // Le score défile de 0 jusqu'au score final (par demi-points)
  const debut = performance.now();
  const duree = 1400;
  function defiler(maintenant) {
    const avance = Math.min(1, (maintenant - debut) / duree);
    $("score-final").textContent = formatPoints(Math.round(points * avance * 2) / 2);
    if (avance < 1) requestAnimationFrame(defiler);
  }
  requestAnimationFrame(defiler);

  // Record (pas pour une révision d'erreurs : ce n'est pas un vrai quiz)
  const record = lireRecord();
  const nouveauRecord = !quiz.revision && points > 0 && (!record || ratio > record.score / record.total);
  if (nouveauRecord) sauverRecord(points, total);
  $("nouveau-record").hidden = !nouveauRecord;

  // Liste des erreurs à revoir
  const liste = $("liste-erreurs");
  liste.innerHTML = "";
  erreurs.forEach((err) => {
    const question = err.sens === "en-fr" ? err.mot.en : err.mot.fr;
    const reponse = err.sens === "en-fr" ? err.mot.fr : err.mot.en;
    const li = document.createElement("li");
    const texte = document.createElement("span");
    const q = document.createElement("strong");
    q.textContent = joli(question);
    const b = document.createElement("span");
    b.className = "bonne";
    b.textContent = joli(reponse);
    texte.append(q, " → ", b);
    li.append(texte, boutonEcouter(err.mot.en));
    liste.appendChild(li);
  });
  $("bloc-erreurs").hidden = erreurs.length === 0;
  $("btn-refaire").hidden = erreurs.length === 0;
  $("nb-erreurs").textContent = erreurs.length;

  // Célébration
  const grandeFete = nouveauBadge || (jours.augmentee && jours.serie > 1);
  sons.fin();
  if (grandeFete) setTimeout(sons.fanfare, 1400);
  if (ratio >= 0.4 || grandeFete) {
    const n = ratio === 1 || nouveauBadge ? 160 : ratio >= 0.8 ? 110 : 60;
    setTimeout(() => {
      confettis(n / 2, window.innerWidth * 0.25, window.innerHeight * 0.4);
      confettis(n / 2, window.innerWidth * 0.75, window.innerHeight * 0.4);
    }, 400);
  }
}

// =====================================================
//  Ma liste (lecture seule : on affiche, on ne modifie jamais)
// =====================================================

const ICONES_ETAT = { reussi: "✅", difficile: "🧠", nouveau: "⚪" };
const TITRES_ETAT = { reussi: "Déjà réussi", difficile: "À revoir", nouveau: "Jamais réussi" };
let filtreEtat = "tous";

function afficherListe() {
  const liste = $("liste-mots");
  const recherche = nettoyer($("recherche").value);
  liste.innerHTML = "";

  // Si un cours est choisi sur l'accueil, on n'affiche que ses mots
  const visibles = motsChoisis().filter((m) =>
    (!recherche || m.en.includes(recherche) || m.fr.includes(recherche)) &&
    (filtreEtat === "tous" || etatDuMot(m.en) === filtreEtat));

  const quelCours = reglages.cours === "tous" ? "" : ` (${reglages.cours})`;
  $("nb-affiches").textContent = `${visibles.length} mot${visibles.length > 1 ? "s" : ""} affiché${visibles.length > 1 ? "s" : ""}${quelCours}.`;

  if (visibles.length === 0) {
    const vide = document.createElement("li");
    vide.className = "liste-vide";
    vide.textContent = "Aucun mot ici 🔍";
    liste.appendChild(vide);
    return;
  }

  visibles.forEach((mot) => {
    const li = document.createElement("li");
    const etat = etatDuMot(mot.en);
    const icone = document.createElement("span");
    icone.className = "etat";
    icone.textContent = ICONES_ETAT[etat];
    icone.title = TITRES_ETAT[etat];
    li.appendChild(icone);

    const textes = document.createElement("div");
    textes.className = "textes";
    const en = document.createElement("div");
    en.className = "en";
    en.textContent = "🇬🇧 " + joli(mot.en);
    const fr = document.createElement("div");
    fr.className = "fr";
    fr.textContent = "🇫🇷 " + joli(mot.fr);
    textes.append(en, fr);
    li.appendChild(textes);
    li.appendChild(boutonEcouter(mot.en));

    // Quand le mot reviendra (révision espacée)
    const quand = document.createElement("span");
    quand.className = "quand";
    const prochaine = statsDe(mot.en).prochaine;
    if (prochaine === null) {
      quand.textContent = "✨ nouveau";
    } else if (estAReviser(mot.en)) {
      quand.textContent = "📅 aujourd'hui";
      quand.classList.add("aujourdhui");
    } else {
      const n = joursAvant(prochaine);
      quand.textContent = n === 1 ? "📅 demain" : `📅 dans ${n} j`;
    }
    li.appendChild(quand);

    liste.appendChild(li);
  });
}

$("recherche").addEventListener("input", afficherListe);

// Filtres : Tous / Réussis / À revoir / Jamais réussis
$("filtres").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  filtreEtat = b.dataset.filtre;
  $("filtres").querySelectorAll("button").forEach((x) => x.classList.toggle("choisi", x === b));
  afficherListe();
});

// =====================================================
//  Appli installable
// =====================================================

const dejaInstallee = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const surIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // les iPad récents se font passer pour un Mac
let demandeInstallation = null; // fournie par Chrome / Edge sur Android et ordinateur

// Android, ordinateur : le navigateur nous prévient que l'appli peut être installée
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  demandeInstallation = e;
  if (!dejaInstallee) $("btn-installer").hidden = false;
});

// iPhone : pas d'installation automatique, on affiche le mode d'emploi
if (surIphone && !dejaInstallee) $("btn-installer").hidden = false;

$("btn-installer").addEventListener("click", async () => {
  if (demandeInstallation) {
    demandeInstallation.prompt();
    const choix = await demandeInstallation.userChoice;
    demandeInstallation = null;
    if (choix.outcome === "accepted") $("btn-installer").hidden = true;
  } else {
    $("aide-installer").hidden = !$("aide-installer").hidden;
  }
});

window.addEventListener("appinstalled", () => {
  $("btn-installer").hidden = true;
  $("aide-installer").hidden = true;
});

// Mode hors-ligne (fichier sw.js) : seulement quand le site est en ligne, pas en double-cliquant sur le fichier
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// =====================================================
//  Démarrage
// =====================================================

remplirMenuCours();
majAccueil();
