// =========================================================================
//  IVALIS — LA FENÊTRE DES TALENTS
// =========================================================================
//  Nico : « dans l'onglet Aperçu, en haut, un bouton pour accéder aux talents
//  du joueur, avec le nombre de talents à attribuer ; en bas, sous les effets
//  de race, le rappel des talents pris. Le bouton ouvre une fenêtre inspirée
//  de l'image : séparée par carac, avec la carac requise des talents ; case
//  grisée quand on n'a pas la carac ; sous le nom des caracs, le compteur des
//  talents pris dans cette carac ; chaque ligne défile à gauche et à droite
//  (molette, doigt), avec une petite flèche tant qu'on n'est pas au bout. »
//
//  Les règles (points, prérequis, effets) vivent dans talents.js ; ce fichier
//  ne fait que les montrer, demander confirmation, et écrire la fiche
//  (Personnages.Talents / Talents_Choix). Un talent pris ne se retire pas :
//  seul l'onglet DEV remet tout à zéro.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const echapper = (t) => String(t === undefined || t === null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// =========================================================================
//  LES SYMBOLES : un médaillon par ligne (Général et les six caracs)
// =========================================================================
//  Dessinés à la main en SVG, dans l'esprit de l'image de Nico : un disque
//  sombre teinté, cerclé d'or, et le symbole couleur parchemin.
const TEINTES = {
    general: ["#8a6a2a", "#3a2a10"], force: ["#a83a28", "#4a140c"], dex: ["#7a6a3a", "#332a12"],
    con: ["#b03a2c", "#521510"], int: ["#6a4a30", "#2a1a10"], sag: ["#4a6050", "#1c2a22"], cha: ["#9a4a2a", "#401a0e"]
};
const etoile = (cx, cy, longs, moyens, courts, branches) => {
    const pts = [];
    for (let i = 0; i < branches * 4; i++) {
        const a = -Math.PI / 2 + i * Math.PI / (branches * 2);
        const r = i % 4 === 0 ? longs : i % 2 === 0 ? moyens : courts;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(" ");
};
const DESSINS = {
    // Un écu, une étoile : ce qui ne dépend d'aucune carac.
    general: `<path d="M32 13 L47 18 V32 C47 42 40 48 32 52 C24 48 17 42 17 32 V18 Z" fill="currentColor"/>
              <path d="M32 18 L42 21.5 V32 C42 39 37 43.5 32 46.5 C27 43.5 22 39 22 32 V21.5 Z" fill="none" stroke="#2a1a10" stroke-width="1.6" opacity=".55"/>
              <polygon points="${etoile(32, 32, 9, 4, 2.6, 2)}" fill="#2a1a10" opacity=".75"/>`,
    // Un poing fermé, vu de face.
    force: `<g fill="currentColor">
              <rect x="19.5" y="18" width="7" height="13" rx="3.5"/><rect x="26.8" y="15.5" width="7" height="15.5" rx="3.5"/>
              <rect x="34.1" y="16.5" width="7" height="14.5" rx="3.5"/><rect x="41.4" y="19.5" width="6.4" height="12" rx="3.2"/>
              <path d="M18.5 28 H48 V35 C48 43.5 42 49 34 49 H31 C23.5 49 18.5 43.5 18.5 36 Z"/>
              <path d="M14.5 27.5 C14.5 23.5 20 23 22.5 26.5 L26.5 32.5 C28 35 26 37.5 23 36.5 L17.5 34 C15.3 33 14.5 30.5 14.5 27.5 Z"/>
              <rect x="25" y="48" width="18" height="7" rx="2"/></g>
            <path d="M26.6 22 V30 M33.9 21 V30 M41.2 22.5 V30.5 M21 36 C25 38 27 36.5 27 34" stroke="#2a1a10" stroke-width="1.3" fill="none" opacity=".5"/>`,
    // Une aile, plume après plume.
    dex: `<path d="M13 47 C20 30 34 18 52 12 C49 21 45 28 36 34 C42 34 46 32 50 30 C46 38 38 43 28 44 C32 46 36 46 40 46 C33 51 22 53 13 47 Z" fill="currentColor"/>
          <path d="M16 45 C26 36 36 27 49 15 M24 41 L33 33 M30 42 L40 34 M23 46 L33 44" stroke="#2a1a10" stroke-width="1.3" fill="none" opacity=".5"/>`,
    // Le cœur.
    con: `<path d="M32 51 C15 40 11 31 14.5 23.5 C18 15.5 28 15.5 32 23 C36 15.5 46 15.5 49.5 23.5 C53 31 49 40 32 51 Z" fill="currentColor"/>
          <path d="M21 25 C22.5 21.5 26 20.5 28 22" stroke="#fff6dc" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>`,
    // Le livre ouvert.
    int: `<path d="M10 20 C18 16.5 26 17.5 31 22 V48 C26 44 18 43 10 46 Z" fill="currentColor"/>
          <path d="M54 20 C46 16.5 38 17.5 33 22 V48 C38 44 46 43 54 46 Z" fill="currentColor"/>
          <path d="M14 25 C19 23.5 23 24 27 26 M14 30 C19 28.5 23 29 27 31 M14 35 C19 33.5 23 34 27 36 M37 26 C41 24 45 23.5 50 25 M37 31 C41 29 45 28.5 50 30 M37 36 C41 34 45 33.5 50 35"
                stroke="#2a1a10" stroke-width="1.2" fill="none" opacity=".55"/>`,
    // L'œil.
    sag: `<path d="M7 32 C17 18 47 18 57 32 C47 46 17 46 7 32 Z" fill="currentColor"/>
          <circle cx="32" cy="32" r="9.5" fill="#2a1a10"/><circle cx="32" cy="32" r="4.2" fill="currentColor"/>
          <circle cx="35" cy="29" r="1.6" fill="#fff6dc" opacity=".8"/>`,
    // L'étoile à huit branches.
    cha: `<polygon points="${etoile(32, 32, 24, 14, 5, 4)}" fill="currentColor"/>
          <circle cx="32" cy="32" r="3.2" fill="#2a1a10" opacity=".7"/>`
};
window.medaillonTalent = function (icone, taille = 64) {
    const [clair, sombre] = TEINTES[icone] || TEINTES.general;
    const idDeg = "deg-tal-" + icone;
    return `<svg class="talents-medaillon" width="${taille}" height="${taille}" viewBox="0 0 64 64" aria-hidden="true">
        <defs><radialGradient id="${idDeg}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${clair}"/><stop offset="1" stop-color="${sombre}"/></radialGradient></defs>
        <circle cx="32" cy="32" r="31" fill="#1a1008"/>
        <circle cx="32" cy="32" r="29" fill="url(#${idDeg})" stroke="#c9a24a" stroke-width="2.4"/>
        <circle cx="32" cy="32" r="25.5" fill="none" stroke="#e8d5a5" stroke-width=".8" opacity=".45"/>
        <g color="#efe0bd" style="filter: drop-shadow(0 1px 1px rgba(0,0,0,.6))">${DESSINS[icone] || DESSINS.general}</g>
    </svg>`;
};

// =========================================================================
//  LE HÉROS DONT ON REGARDE LES TALENTS
// =========================================================================
//  La fiche ouverte (afficherStatsCombat) dépose ici le héros affiché. On ne
//  relit pas la base : c'est la même fiche que l'Aperçu montre.
window.TALENTS_FICHE = window.TALENTS_FICHE || null;
const persoFiche = () => window.TALENTS_FICHE;

// Les caracs du héros : partagées par la partie, sinon lues une fois.
async function assurerCaracs(perso) {
    if (!perso || window.caracsConnuesPourTalents(perso)) return;
    const id = perso.idPersonnage;
    if (!id) return;
    try {
        const snap = await getDoc(doc(db, "Caracteristiques", id));
        window.CARACS_PARTIE = window.CARACS_PARTIE || {};
        window.CARACS_PARTIE[id] = snap.exists() ? snap.data() : {};
    } catch (e) { console.error("Talents : lecture des caractéristiques", e); }
}

// =========================================================================
//  L'APERÇU : LE BOUTON EN HAUT, LE RAPPEL EN BAS
// =========================================================================
window.actualiserTalentsApercu = function (perso) {
    if (perso) window.TALENTS_FICHE = perso;
    perso = persoFiche();
    const bouton = document.getElementById("btn-talents-apercu");
    const rappel = document.getElementById("encart-talents-pris");
    if (!perso) return;
    const dispo = window.pointsTalentsDisponibles(perso);
    if (bouton) {
        bouton.classList.toggle("a-attribuer", dispo > 0);
        bouton.innerHTML = `<span class="apercu-btn-talents-icone">✦</span><span class="apercu-btn-talents-mot">Talents</span>`
            + (dispo > 0 ? `<span class="apercu-btn-talents-compte">${dispo} à attribuer</span>` : "");
    }
    if (rappel) {
        const pris = window.talentsDuPerso(perso);
        const ids = window.TALENTS.filter(t => pris[t.id]).map(t => t.id);
        if (ids.length === 0) { rappel.innerHTML = ""; return; }
        rappel.innerHTML = `<div class="talents-rappel-titre">Talents</div>
            <div class="talents-rappel-liste">${ids.map(id => {
                const t = window.talentParId(id);
                const ligne = window.LIGNES_TALENTS.find(l => l.cle === t.carac) || window.LIGNES_TALENTS[0];
                return `<div class="talents-rappel-ligne" data-talent="${id}">
                    ${window.medaillonTalent(ligne.icone, 30)}
                    <span class="talents-rappel-texte"><b>${echapper(t.nom)}${t.max > 1 ? ` <span class="talents-rappel-rang">${pris[id]}/${t.max}</span>` : ""}</b>
                    <span class="talents-rappel-effet">${echapper(window.resumeTalent(perso, id))}</span></span>
                </div>`;
            }).join("")}</div>`;
    }
};

// =========================================================================
//  LA FENÊTRE
// =========================================================================
function fenetre() {
    let f = document.getElementById("fenetre-talents");
    if (f) return f;
    f = document.createElement("div");
    f.id = "fenetre-talents";
    f.className = "talents-voile";
    f.innerHTML = `
      <div class="talents-parchemin" role="dialog" aria-label="Talents">
        <div class="talents-entete">
          <div>
            <h2 class="talents-titre">Talents</h2>
            <p class="talents-sous-titre">Un talent aux niveaux 3, 5, 7 et 9. Choisissez ceux qui correspondent à votre style de jeu — un choix définitif.</p>
          </div>
          <div class="talents-dispo">
            ${window.medaillonTalent("general", 40)}
            <div><span class="talents-dispo-mot">Talents disponibles</span><b id="talents-dispo-nombre">0</b></div>
          </div>
        </div>
        <div class="talents-filet"><span>✦</span></div>
        <div class="talents-corps" id="talents-corps"></div>
        <div class="talents-pied">
          <button type="button" class="talents-retour" onclick="window.fermerTalents()"><span>‹</span> Retour</button>
          <span class="talents-pied-orne">✦</span>
        </div>
      </div>`;
    f.addEventListener("click", (e) => { if (e.target === f) window.fermerTalents(); });
    document.body.appendChild(f);
    return f;
}

function htmlCase(perso, t) {
    const etat = window.etatTalent(perso, t.id);
    const rangs = etat.rangs || 0;
    const classes = ["talent-case"];
    if (rangs > 0) classes.push("pris");
    if (etat.complet) classes.push("complet");
    if (etat.ok) classes.push("prenable");
    if (etat.verrou) classes.push("verrou");
    if (etat.aVenir) classes.push("a-venir");
    if (etat.sansPoint) classes.push("sans-point");
    const coche = rangs > 0 ? "✔" : "";
    const compteur = t.max > 1 ? `<span class="talent-rangs">${rangs}/${t.max}</span>` : "";
    const raison = etat.verrou ? `<span class="talent-raison">🔒 ${echapper(etat.raison)}</span>`
        : etat.aVenir ? `<span class="talent-raison">À venir</span>` : "";
    const effet = rangs > 0 ? window.resumeTalent(perso, t.id) : t.texte;
    return `<div class="${classes.join(" ")}" data-talent="${t.id}" ${etat.ok ? `role="button" tabindex="0"` : ""}
                title="${echapper(t.texte)}">
        <span class="talent-exigence">${echapper(window.libelleExigenceTalent(t))}</span>
        <span class="talent-tete"><span class="talent-coche">${coche}</span><span class="talent-nom">${echapper(t.nom)}</span>${compteur}</span>
        <span class="talent-effet">${echapper(effet)}</span>
        ${raison}
    </div>`;
}

window.dessinerTalents = function () {
    const perso = persoFiche();
    const corps = document.getElementById("talents-corps");
    if (!perso || !corps) return;
    const pris = window.talentsDuPerso(perso);
    const dispo = window.pointsTalentsDisponibles(perso);
    const n = document.getElementById("talents-dispo-nombre");
    if (n) n.textContent = dispo;
    // Les positions de défilement survivent au redessin (on vient de cocher).
    const positions = {};
    corps.querySelectorAll(".talents-piste").forEach(p => { positions[p.dataset.ligne] = p.scrollLeft; });
    corps.innerHTML = window.LIGNES_TALENTS.map(ligne => {
        const talents = window.TALENTS.filter(t => t.carac === ligne.cle);
        const prisLigne = talents.reduce((s, t) => s + (pris[t.id] || 0), 0);
        const total = talents.reduce((s, t) => s + (t.aVenir ? 0 : t.max), 0);
        const valeur = ligne.cle ? window.caracPourTalents(perso, ligne.cle) : null;
        return `<div class="talents-ligne" data-ligne="${ligne.icone}">
            <div class="talents-ligne-tete">
              ${window.medaillonTalent(ligne.icone, 62)}
              <div class="talents-ligne-nom">
                <b>${ligne.nom}</b>
                <span class="talents-ligne-compte">${prisLigne}/${total}</span>
                ${valeur !== null ? `<span class="talents-ligne-valeur">${ligne.court} ${valeur}</span>` : ""}
              </div>
            </div>
            <div class="talents-piste-cadre">
              <button type="button" class="talents-fleche gauche" aria-label="Défiler à gauche">‹</button>
              <div class="talents-piste" data-ligne="${ligne.icone}">${talents.map(t => htmlCase(perso, t)).join("")}</div>
              <button type="button" class="talents-fleche droite" aria-label="Défiler à droite">›</button>
            </div>
        </div>`;
    }).join("");
    corps.querySelectorAll(".talents-piste").forEach(piste => {
        if (positions[piste.dataset.ligne] !== undefined) piste.scrollLeft = positions[piste.dataset.ligne];
        installerDefilement(piste);
    });
    corps.querySelectorAll(".talent-case.prenable").forEach(c => {
        c.addEventListener("click", () => window.demanderTalent(c.dataset.talent));
        c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.demanderTalent(c.dataset.talent); } });
    });
};

// LE DÉFILEMENT D'UNE LIGNE : la molette fait glisser à gauche et à droite
// tant que la ligne n'est pas au bout (au bout, elle rend la main au
// défilement de la fenêtre) ; le doigt glisse nativement ; les flèches
// n'apparaissent que s'il reste quelque chose à voir de leur côté.
function installerDefilement(piste) {
    const cadre = piste.parentElement;
    const gauche = cadre.querySelector(".talents-fleche.gauche");
    const droite = cadre.querySelector(".talents-fleche.droite");
    const majFleches = () => {
        const max = piste.scrollWidth - piste.clientWidth;
        gauche.classList.toggle("visible", piste.scrollLeft > 2);
        droite.classList.toggle("visible", piste.scrollLeft < max - 2);
    };
    piste.addEventListener("scroll", majFleches, { passive: true });
    piste.addEventListener("wheel", (e) => {
        const max = piste.scrollWidth - piste.clientWidth;
        if (max <= 0) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if ((delta < 0 && piste.scrollLeft <= 0) || (delta > 0 && piste.scrollLeft >= max - 1)) return;
        e.preventDefault();
        piste.scrollLeft += delta;
    }, { passive: false });
    const pas = () => Math.max(160, piste.clientWidth * 0.8);
    gauche.onclick = () => piste.scrollBy({ left: -pas(), behavior: "smooth" });
    droite.onclick = () => piste.scrollBy({ left: pas(), behavior: "smooth" });
    majFleches();
    // Une image ou une police qui arrive après change la largeur : on revérifie.
    requestAnimationFrame(majFleches);
}

window.ouvrirTalents = async function () {
    const perso = persoFiche();
    if (!perso) return;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await assurerCaracs(perso);
    const f = fenetre();
    f.style.display = "flex";
    window.dessinerTalents();
};
window.fermerTalents = function () {
    const f = document.getElementById("fenetre-talents");
    if (f) f.style.display = "none";
    fermerPopup();
};

// =========================================================================
//  LA CONFIRMATION (et le choix de carac du Perfectionnement)
// =========================================================================
function fermerPopup() {
    const p = document.getElementById("popup-talent");
    if (p) p.remove();
}
window.demanderTalent = function (id) {
    const perso = persoFiche();
    const t = window.talentParId(id);
    if (!perso || !t || !window.etatTalent(perso, id).ok) return;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    fermerPopup();
    const ligne = window.LIGNES_TALENTS.find(l => l.cle === t.carac) || window.LIGNES_TALENTS[0];
    const rangs = window.talentsDuPerso(perso)[id] || 0;
    const p = document.createElement("div");
    p.id = "popup-talent";
    p.className = "talents-popup-voile";
    p.innerHTML = `<div class="talents-popup" role="dialog">
        <div class="talents-popup-tete">${window.medaillonTalent(ligne.icone, 54)}
          <div><div class="talents-popup-nom">${echapper(t.nom)}${t.max > 1 ? ` <span class="talent-rangs">${rangs + 1}/${t.max}</span>` : ""}</div>
          <div class="talents-popup-exigence">${echapper(ligne.nom)} · ${echapper(window.libelleExigenceTalent(t))}</div></div>
        </div>
        <p class="talents-popup-texte">${echapper(t.texte)}</p>
        ${t.choixCarac ? `<div class="talents-popup-choix-titre">Caractéristique perfectionnée</div>
          <div class="talents-popup-choix">${window.LIGNES_TALENTS.filter(l => l.cle).map(l =>
            `<button type="button" class="talents-popup-carac" data-carac="${l.cle}">${window.medaillonTalent(l.icone, 34)}<span>${l.nom}</span></button>`).join("")}</div>` : ""}
        <p class="talents-popup-avertissement">Ce choix est définitif.</p>
        <div class="talents-popup-boutons">
          <button type="button" class="talents-popup-annuler">Annuler</button>
          <button type="button" class="talents-popup-prendre" ${t.choixCarac ? "disabled" : ""}>Prendre ce talent</button>
        </div>
    </div>`;
    document.body.appendChild(p);
    let choix = null;
    const prendre = p.querySelector(".talents-popup-prendre");
    p.querySelectorAll(".talents-popup-carac").forEach(b => b.onclick = () => {
        p.querySelectorAll(".talents-popup-carac").forEach(x => x.classList.toggle("choisi", x === b));
        choix = b.dataset.carac;
        prendre.disabled = false;
    });
    p.querySelector(".talents-popup-annuler").onclick = fermerPopup;
    p.addEventListener("click", (e) => { if (e.target === p) fermerPopup(); });
    prendre.onclick = async () => {
        prendre.disabled = true;
        prendre.textContent = "⏳ …";
        const ok = await window.prendreTalent(id, choix);
        if (ok) fermerPopup();
        else { prendre.disabled = false; prendre.textContent = "Prendre ce talent"; }
    };
};

// L'ÉCRITURE : on revérifie tout (points, carac requise) au moment d'écrire.
window.prendreTalent = async function (id, choix) {
    const perso = persoFiche();
    const t = window.talentParId(id);
    if (!perso || !t) return false;
    const etat = window.etatTalent(perso, id);
    if (!etat.ok) { alert(etat.raison || "Ce talent ne peut pas être pris."); return false; }
    if (t.choixCarac && !choix) { alert("Choisissez une caractéristique."); return false; }
    const talents = { ...window.talentsDuPerso(perso), [id]: (window.talentsDuPerso(perso)[id] || 0) + 1 };
    const choixTous = { ...window.choixTalentsDuPerso(perso), ...(choix ? { [id]: choix } : {}) };
    try {
        await updateDoc(doc(db, "Personnages", perso.idPersonnage), { Talents: talents, Talents_Choix: choixTous });
    } catch (e) {
        console.error("Prendre un talent :", e);
        alert("Le talent n'a pas pu être enregistré.");
        return false;
    }
    appliquerTalentsLocaux(perso.idPersonnage, talents, choixTous);
    if (typeof window.afficherMessageFlottant === "function") window.afficherMessageFlottant(`✦ ${t.nom}`);
    return true;
};

// La fiche affichée et les listes du jeu prennent tout de suite la nouvelle
// valeur (l'écoute de la base suivra) : l'Aperçu se redessine avec ses bonus.
function appliquerTalentsLocaux(id, talents, choix) {
    const cibles = [persoFiche(), ...[window.PERSOS_PARTIE, window.PERSOS_JOUEURS_PARTIE, window.COMBAT_PERSOS_JOUEUR]
        .flatMap(l => (l || []).filter(p => p && p.idPersonnage === id))];
    new Set(cibles.filter(Boolean)).forEach(p => {
        p.talents = { ...talents }; p.talentsChoix = { ...choix };
        if (p.Talents !== undefined) p.Talents = { ...talents };
        if (p.Talents_Choix !== undefined) p.Talents_Choix = { ...choix };
    });
    const fiche = persoFiche();
    if (fiche && typeof window.afficherStatsCombat === "function") window.afficherStatsCombat(fiche);
    else window.actualiserTalentsApercu();
    if (document.getElementById("fenetre-talents") && document.getElementById("fenetre-talents").style.display !== "none") window.dessinerTalents();
}

// =========================================================================
//  L'OUTIL DEV : remettre les talents à zéro
// =========================================================================
window.reinitialiserTalentsDev = async function () {
    const id = (document.getElementById("champ-id-personnage") || {}).value;
    if (!id) { alert("Ouvrez d'abord la fiche d'un héros existant."); return; }
    const nom = (document.getElementById("titre-nom-personnage") || {}).innerText || "ce héros";
    if (!confirm(`Retirer tous les talents de ${nom} ? Ses points redeviennent disponibles.`)) return;
    try {
        await updateDoc(doc(db, "Personnages", id), { Talents: {}, Talents_Choix: {} });
        appliquerTalentsLocaux(id, {}, {});
        if (typeof window.afficherMessageFlottant === "function") window.afficherMessageFlottant("Talents remis à zéro");
    } catch (e) {
        console.error("Réinitialiser les talents :", e);
        alert("Échec de la remise à zéro des talents.");
    }
};
