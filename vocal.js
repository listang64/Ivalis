// =========================================================================
//  IVALIS — LE CHAT VOCAL DE LA TABLE (v396)
// =========================================================================
//  Nico : « un papier qui sort côté gauche bas du livre, avec les noms des
//  joueurs présents dans la partie. Un point rouge style magique si le micro
//  n'est pas mis, vert s'il est bon ; quand il parle, ça devient plus vert. Un
//  truc pour couper son micro ou couper le son. Quand le narrateur écrit, tant
//  qu'on n'a pas cliqué sur Lecture terminée, le son des autres baisse un peu.
//  Le micro se coupe quand on dicte son RP (les autres n'entendent pas ce
//  qu'on écrit) : là, un point violet magique. » 4 joueurs au plus, un bouton
//  « Rejoindre » sur le papier.
//
//  COMMENT : WebRTC, de poste à poste (chacun parle directement aux 3 autres :
//  rien ne passe par un serveur, donc gratuit). Pour se trouver, les postes
//  s'échangent leurs « offres » par Firestore :
//    Vocal/{partie}/Presents/{joueur} — qui est dans le vocal (Etat, Vu, Session)
//    Vocal/{partie}/Signaux/{auto}    — offre / réponse / ice, lus puis effacés
//  Des deux postes d'une paire, celui dont l'identifiant est le plus petit
//  appelle l'autre (jamais deux appels croisés). Le son des autres passe par
//  Web Audio : un volume par joueur (sourdine, lecture), et l'écoute du niveau
//  (le point s'allume quand il parle).
//
//  Le site doit être servi en HTTPS (GitHub Pages l'est) : sans lui, le
//  navigateur refuse le micro. Les serveurs STUN de Google suffisent à la
//  plupart des connexions ; un relais TURN (réseaux d'entreprise, 4G stricte)
//  peut s'ajouter dans Firestore : Vocal_Config/ice, { Serveurs: [...] }.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { collection, doc, setDoc, deleteDoc, addDoc, getDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const MAX_JOUEURS = 4;
const BATTEMENT_MS = 15000;              // « je suis là », toutes les 15 s
const ABSENT_MS = 50000;                 // sans nouvelles depuis 50 s : parti
const VOLUME_LECTURE = 0.35;             // le son des autres pendant la lecture
const SEUIL_PAROLE = 0.03;               // le niveau (RMS) au-delà duquel on parle
const TENUE_PAROLE_MS = 350;             // le point reste allumé entre deux mots
const ICE_PAR_DEFAUT = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const frais = (p) => !!p && Date.now() - (Number(p.Vu) || 0) < ABSENT_MS;

const v = {
    partie: null, el: null,
    presents: {},                        // idJoueur -> { Nom, Etat, Vu, Session }
    ecoutePresents: null, ecouteSignaux: null, lente: null, battement: null, boucle: null,
    rejoint: false, session: "", ice: ICE_PAR_DEFAUT,
    flux: null, piste: null, micro: "aucun",       // "ok" | "refuse" | "aucun"
    coupe: false, sourdine: false, dictee: false, lecture: false, muets: new Set(),
    pairs: new Map(), attente: [], file: Promise.resolve(),
    ctx: null, analyseLocale: null, sourceLocale: null, parleMoi: false, parleMoiJusqua: 0,
    note: ""
};

// ---------------------------------------------------------------------
//  LE PAPIER
// ---------------------------------------------------------------------
const SVG_MICRO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c-1.7 0-2.9 1.3-2.9 2.9v5.6c0 1.7 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9V6.1c0-1.6-1.2-2.9-2.9-2.9z"/><path d="M6.2 10.9c0 3.4 2.6 6 5.8 6s5.8-2.6 5.8-6M12 17v3.6M8.8 20.7h6.5"/><path class="barre" d="M4.5 3.8l15 16.6"/></svg>`;
const SVG_CASQUE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 15.4v-3.2c0-4.4 3.5-7.9 7.8-7.9s7.8 3.5 7.8 7.9v3.2"/><path d="M4.2 14.2h2.6c.6 0 1 .4 1 1v4c0 .6-.4 1-1 1H5.2c-.6 0-1-.4-1-1zM19.8 14.2h-2.6c-.6 0-1 .4-1 1v4c0 .6.4 1 1 1h1.6c.6 0 1-.4 1-1z"/><path class="barre" d="M4.5 3.8l15 16.6"/></svg>`;

function creerPapier() {
    const g = window.GRIMOIRE, scene = g && g.scene && g.scene();
    if (!scene || v.el) return;
    const bord = document.createElement("div");
    bord.className = "vocal-bord";
    bord.id = "vocal-bord";
    bord.innerHTML = `<div class="papier-vocal" id="papier-vocal" aria-label="La voix de la table">
        <div class="feuille-vocal">
          <ul class="vocal-joueurs" id="vocal-joueurs"></ul>
          <div class="vocal-actions" id="vocal-actions"></div>
          <p class="vocal-note" id="vocal-note"></p>
        </div></div>
        <div class="recit-tranche" aria-hidden="true"></div>`;
    // (les couches hautes de la tranche par-dessus : il sort d'entre les feuillets)
    // Glissé sous la page de gauche, comme les papiers des avatars (grimoire_recit.js).
    scene.insertBefore(bord, document.getElementById("recit-avatars") || document.getElementById("grimoire-marque-page") || null);
    v.el = bord;
    toucher(bord, (cible) => {
        const b = cible.closest("[data-vocal]");
        if (!b) return;
        const a = b.dataset.vocal;
        if (a === "rejoindre") rejoindre();
        else if (a === "quitter") quitter();
        else if (a === "micro") couperMicro();
        else if (a === "casque") basculerSourdine();
        else if (a === "muet") basculerMuet(b.dataset.joueur);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => { if (v.el) v.el.querySelector(".papier-vocal").classList.add("sortie"); }));
    maj();
}
// Agir dès que le doigt se lève (Safari retarde le « click », v298).
function toucher(el, faire) {
    let appui = null, dernier = 0;
    el.addEventListener("pointerdown", (ev) => { appui = { x: ev.clientX, y: ev.clientY, t: Date.now(), cible: ev.target }; });
    el.addEventListener("pointerup", (ev) => {
        const a = appui; appui = null;
        if (!a || Date.now() - a.t > 900 || Math.hypot(ev.clientX - a.x, ev.clientY - a.y) > 14) return;
        dernier = Date.now(); faire(a.cible);
    });
    el.addEventListener("click", (ev) => { if (Date.now() - dernier < 1000) return; faire(ev.target); });
}

// Les joueurs de la table : ceux qui ont un héros actif, et ceux qui sont dans le vocal.
function joueursDeLaTable() {
    const ids = [];
    const ajouter = (id) => { if (id && !ids.includes(id)) ids.push(id); };
    ajouter(moi());
    const source = (window.PERSOS_JOUEURS_PARTIE && window.PERSOS_JOUEURS_PARTIE.length ? window.PERSOS_JOUEURS_PARTIE : window.PERSOS_PARTIE) || [];
    source.forEach(h => { if (h && h.idJoueur && !h.estMonstre && !h.estIllusion && h.actif !== false && h.statut !== "Mort") ajouter(h.idJoueur); });
    Object.keys(v.presents).forEach(id => { if (frais(v.presents[id])) ajouter(id); });
    return ids.slice(0, 8);
}
function nomDe(id) {
    if (id === moi() && window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.nom) return window.COMPTE_JOUEUR.nom;
    const nom = typeof window.nomDuJoueurLivre === "function" ? window.nomDuJoueurLivre(id) : "";
    if (nom && nom !== id) return nom;
    if (v.presents[id] && v.presents[id].Nom) return v.presents[id].Nom;
    const source = window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [];
    return source.filter(h => h && h.idJoueur === id && h.actif !== false).map(h => h.prenom).filter(Boolean).join(" / ") || id;
}
// La couleur du point : rouge (pas de micro), vert (micro ouvert), violet (dictée).
function couleurDe(id) {
    if (id === moi()) {
        if (!v.rejoint) return "rouge";
        if (v.dictee) return "violet";
        return v.micro === "ok" && !v.coupe ? "vert" : "rouge";
    }
    const p = v.presents[id];
    if (!frais(p)) return "rouge";
    return p.Etat === "dictee" ? "violet" : p.Etat === "ok" ? "vert" : "rouge";
}
function parle(id) {
    if (id === moi()) return v.parleMoi;
    const pair = v.pairs.get(id);
    return !!(pair && pair.parle);
}
function etatPublie() {
    if (v.dictee) return "dictee";
    if (v.micro === "refuse") return "refuse";
    return v.micro === "ok" && !v.coupe ? "ok" : "coupe";
}

function maj() {
    if (!v.el) return;
    const liste = v.el.querySelector("#vocal-joueurs");
    const ids = joueursDeLaTable();
    const html = ids.map(id => {
        const c = couleurDe(id), lui = id === moi();
        const muet = !lui && (v.muets.has(id) || v.sourdine);
        const titre = lui ? "" : v.muets.has(id) ? "Rendre la voix" : "Couper sa voix";
        return `<li class="vocal-joueur${lui ? " moi" : ""}${muet ? " muet" : ""}" data-joueur="${echapper(id)}">
            <span class="point-magique ${c}${parle(id) && c === "vert" ? " parle" : ""}" aria-hidden="true"><i></i></span>
            ${lui ? `<span class="nom-vocal">${echapper(nomDe(id))}</span>`
                  : `<button type="button" class="nom-vocal" data-vocal="muet" data-joueur="${echapper(id)}" title="${titre}">${echapper(nomDe(id))}</button>`}
          </li>`;
    }).join("");
    if (liste.__html !== html) { liste.innerHTML = html; liste.__html = html; }
    const actions = v.el.querySelector("#vocal-actions");
    const voulu = !v.rejoint
        ? `<button type="button" class="bouton-vocal rejoindre" data-vocal="rejoindre">Rejoindre</button>`
        : `<button type="button" class="icone-vocal${v.coupe || v.micro !== "ok" ? " coupe" : ""}" data-vocal="micro" aria-label="${v.coupe ? "Rouvrir mon micro" : "Couper mon micro"}" title="${v.coupe ? "Rouvrir mon micro" : "Couper mon micro"}"${v.micro === "refuse" ? " disabled" : ""}>${SVG_MICRO}</button>
           <button type="button" class="icone-vocal${v.sourdine ? " coupe" : ""}" data-vocal="casque" aria-label="${v.sourdine ? "Rendre le son des autres" : "Couper le son des autres"}" title="${v.sourdine ? "Rendre le son des autres" : "Couper le son des autres"}">${SVG_CASQUE}</button>
           <button type="button" class="bouton-vocal partir" data-vocal="quitter">Quitter</button>`;
    if (actions.__html !== voulu) { actions.innerHTML = voulu; actions.__html = voulu; }
    const note = v.el.querySelector("#vocal-note");
    const texte = v.note || (v.rejoint && v.lecture && !v.sourdine ? "Lecture : les voix se font discrètes" : "");
    if (note.textContent !== texte) note.textContent = texte;
}
// Seuls les points changent quand quelqu'un parle (pas toute la liste).
function majPoints() {
    if (!v.el) return;
    v.el.querySelectorAll(".vocal-joueur").forEach(li => {
        const id = li.dataset.joueur, point = li.querySelector(".point-magique");
        if (point) point.classList.toggle("parle", parle(id) && point.classList.contains("vert"));
    });
}

// ---------------------------------------------------------------------
//  ENTRER DANS LA PARTIE / EN SORTIR (grimoire.js)
// ---------------------------------------------------------------------
function entrer(idPartie) {
    if (!idPartie) return;
    if (v.partie === idPartie && v.el) return;
    if (v.partie) sortir();
    v.partie = idPartie;
    v.presents = {};
    creerPapier();
    try {
        v.ecoutePresents = onSnapshot(collection(db, "Vocal", idPartie, "Presents"), (snap) => {
            const presents = {};
            snap.forEach(d => { presents[d.id] = d.data(); });
            v.presents = presents;
            synchroniserPairs();
            maj();
        }, (e) => console.error("Vocal : présents", e));
    } catch (e) { console.error("Vocal : présents", e); }
    // Les absents s'effacent d'eux-mêmes (plus de battement).
    v.lente = setInterval(() => { synchroniserPairs(); maj(); }, 5000);
}
function sortir() {
    quitter();
    if (v.ecoutePresents) { try { v.ecoutePresents(); } catch (e) {} v.ecoutePresents = null; }
    clearInterval(v.lente); v.lente = null;
    if (v.el) { v.el.remove(); v.el = null; }
    v.partie = null; v.presents = {}; v.note = "";
}

// ---------------------------------------------------------------------
//  REJOINDRE / QUITTER LE VOCAL
// ---------------------------------------------------------------------
async function rejoindre() {
    if (v.rejoint || !v.partie || !moi()) return;
    const autres = Object.keys(v.presents).filter(id => id !== moi() && frais(v.presents[id]));
    if (autres.length >= MAX_JOUEURS) { v.note = `La table est pleine (${MAX_JOUEURS} voix).`; maj(); return; }
    // (iPad) le son ne s'ouvre que dans le geste du joueur : avant tout « await ».
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!v.ctx && Ctx) v.ctx = new Ctx();
        if (v.ctx && v.ctx.state !== "running") v.ctx.resume().catch(() => {});
    } catch (e) { console.error("Vocal : le son", e); }
    v.rejoint = true;
    v.note = "";
    v.session = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    v.coupe = false;
    maj();
    if (!v.dictee) await ouvrirMicro();
    try {
        const cfg = await getDoc(doc(db, "Vocal_Config", "ice"));
        const s = cfg.exists() ? cfg.data().Serveurs : null;
        if (Array.isArray(s) && s.length) v.ice = s;
    } catch (e) {}
    if (!v.rejoint) return;
    try {
        v.ecouteSignaux = onSnapshot(query(collection(db, "Vocal", v.partie, "Signaux"), where("A", "==", moi())), (snap) => {
            const recus = [];
            snap.docChanges().forEach(c => { if (c.type === "added") recus.push({ id: c.doc.id, s: c.doc.data() }); });
            recus.sort((a, b) => (Number(a.s.Quand) || 0) - (Number(b.s.Quand) || 0));
            recus.forEach(r => { v.file = v.file.then(() => recevoir(r.id, r.s)).catch(e => console.error("Vocal : signal", e)); });
        }, (e) => console.error("Vocal : signaux", e));
    } catch (e) { console.error("Vocal : signaux", e); }
    await publier();
    v.battement = setInterval(publier, BATTEMENT_MS);
    v.boucle = setInterval(ecouterNiveaux, 120);
    synchroniserPairs();
    maj();
}
function quitter() {
    if (!v.rejoint) return;
    v.rejoint = false;
    clearInterval(v.battement); v.battement = null;
    clearInterval(v.boucle); v.boucle = null;
    if (v.ecouteSignaux) { try { v.ecouteSignaux(); } catch (e) {} v.ecouteSignaux = null; }
    [...v.pairs.keys()].forEach(fermerPair);
    fermerMicro();
    v.parleMoi = false;
    v.attente = [];
    if (v.partie && moi()) deleteDoc(doc(db, "Vocal", v.partie, "Presents", moi())).catch(() => {});
    if (v.ctx) v.ctx.suspend().catch(() => {});
    maj();
}
async function publier() {
    if (!v.rejoint || !v.partie || !moi()) return;
    try {
        await setDoc(doc(db, "Vocal", v.partie, "Presents", moi()), { Nom: nomDe(moi()), Etat: etatPublie(), Vu: Date.now(), Session: v.session });
    } catch (e) { console.error("Vocal : présence", e); }
}

// LE MICRO : écho, bruit et gain réglés par le navigateur.
async function ouvrirMicro() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        v.micro = "refuse";
        v.note = location.protocol === "https:" || location.hostname === "localhost" ? "Ce navigateur n'a pas de micro." : "Le micro demande le site en https.";
        maj(); return;
    }
    try {
        const flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (!v.rejoint || v.dictee) { flux.getTracks().forEach(t => t.stop()); return; }
        v.flux = flux;
        v.piste = flux.getAudioTracks()[0] || null;
        if (v.piste) v.piste.enabled = !v.coupe;
        v.micro = v.piste ? "ok" : "refuse";
        if (v.ctx && v.piste) {
            try {
                v.sourceLocale = v.ctx.createMediaStreamSource(flux);
                v.analyseLocale = v.ctx.createAnalyser();
                v.analyseLocale.fftSize = 512;
                v.sourceLocale.connect(v.analyseLocale);          // écouté, jamais rejoué
            } catch (e) { v.analyseLocale = null; }
        }
        v.pairs.forEach(pair => { if (pair.envoi) pair.envoi.replaceTrack(v.piste).catch(() => {}); });
    } catch (e) {
        v.micro = "refuse";
        v.note = "Micro refusé : tu entends les autres, eux ne t'entendent pas.";
    }
    maj();
}
function fermerMicro() {
    if (v.sourceLocale) { try { v.sourceLocale.disconnect(); } catch (e) {} v.sourceLocale = null; }
    v.analyseLocale = null;
    if (v.flux) v.flux.getTracks().forEach(t => t.stop());
    v.flux = null; v.piste = null;
    if (v.micro === "ok") v.micro = "aucun";
    v.pairs.forEach(pair => { if (pair.envoi) pair.envoi.replaceTrack(null).catch(() => {}); });
}
function couperMicro() {
    if (!v.rejoint || v.micro === "refuse") return;
    v.coupe = !v.coupe;
    if (v.piste) v.piste.enabled = !v.coupe;
    publier();
    maj();
}
function basculerSourdine() {
    v.sourdine = !v.sourdine;
    appliquerVolumes();
    maj();
}
function basculerMuet(id) {
    if (!id || id === moi()) return;
    if (v.muets.has(id)) v.muets.delete(id); else v.muets.add(id);
    appliquerVolumes();
    maj();
}

// ---------------------------------------------------------------------
//  LES PAIRES (WebRTC)
// ---------------------------------------------------------------------
// Une paire par joueur présent ; celui qui a le plus petit identifiant appelle.
function synchroniserPairs() {
    if (!v.rejoint) return;
    v.pairs.forEach((pair, id) => {
        const p = v.presents[id];
        if (!frais(p) || p.Session !== pair.session) fermerPair(id);
    });
    Object.keys(v.presents).forEach(id => {
        const p = v.presents[id];
        if (id === moi() || !frais(p) || !p.Session || v.pairs.has(id)) return;
        if (moi() < id) appeler(id, p.Session);
    });
}
function creerPair(id, session, appelant) {
    const pc = new RTCPeerConnection({ iceServers: v.ice });
    const pair = { id, session, pc, appelant, envoi: null, candidats: [], distante: false, audio: null, source: null, gain: null, analyseur: null, parle: false, jusqua: 0 };
    v.pairs.set(id, pair);
    pc.onicecandidate = (ev) => { if (ev.candidate) envoyer(id, session, "ice", ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate); };
    pc.ontrack = (ev) => brancherSon(pair, (ev.streams && ev.streams[0]) || new MediaStream([ev.track]));
    pc.onconnectionstatechange = () => {
        if (v.pairs.get(id) !== pair) return;
        if (pc.connectionState === "failed") {
            fermerPair(id);
            if (appelant) setTimeout(synchroniserPairs, 1500);       // on rappelle
        }
    };
    return pair;
}
async function appeler(id, session) {
    const pair = creerPair(id, session, true);
    const tr = pair.pc.addTransceiver(v.piste || "audio", { direction: "sendrecv", streams: v.flux ? [v.flux] : [] });
    pair.envoi = tr.sender;
    try {
        const offre = await pair.pc.createOffer();
        await pair.pc.setLocalDescription(offre);
        await envoyer(id, session, "offre", { type: offre.type, sdp: offre.sdp });
    } catch (e) { console.error("Vocal : l'appel", e); fermerPair(id); }
}
function fermerPair(id) {
    const pair = v.pairs.get(id);
    if (!pair) return;
    v.pairs.delete(id);
    try { pair.pc.close(); } catch (e) {}
    if (pair.source) { try { pair.source.disconnect(); } catch (e) {} }
    if (pair.gain) { try { pair.gain.disconnect(); } catch (e) {} }
    if (pair.audio) { pair.audio.srcObject = null; pair.audio.remove(); }
}
async function envoyer(a, aSession, type, donnees) {
    if (!v.partie) return;
    try {
        await addDoc(collection(db, "Vocal", v.partie, "Signaux"), {
            De: moi(), A: a, DeSession: v.session, ASession: aSession, Type: type, Donnees: JSON.stringify(donnees), Quand: Date.now()
        });
    } catch (e) { console.error("Vocal : envoi", e); }
}
async function recevoir(idDoc, s) {
    if (v.partie) deleteDoc(doc(db, "Vocal", v.partie, "Signaux", idDoc)).catch(() => {});
    if (!v.rejoint || s.ASession !== v.session) return;          // un vieux signal : oublié
    let donnees = null;
    try { donnees = JSON.parse(s.Donnees || "null"); } catch (e) { return; }
    let pair = v.pairs.get(s.De);
    if (s.Type === "offre") {
        if (pair && pair.session !== s.DeSession) { fermerPair(s.De); pair = null; }
        if (!pair) pair = creerPair(s.De, s.DeSession, false);
        await pair.pc.setRemoteDescription(donnees);
        const tr = pair.pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === "audio") || pair.pc.getTransceivers()[0];
        if (tr) {
            tr.direction = "sendrecv";
            pair.envoi = tr.sender;
            if (v.piste) await tr.sender.replaceTrack(v.piste);
            if (v.flux && tr.sender.setStreams) { try { tr.sender.setStreams(v.flux); } catch (e) {} }
        }
        const reponse = await pair.pc.createAnswer();
        await pair.pc.setLocalDescription(reponse);
        await envoyer(s.De, s.DeSession, "reponse", { type: reponse.type, sdp: reponse.sdp });
        await viderCandidats(pair);
    } else if (s.Type === "reponse") {
        if (!pair || pair.session !== s.DeSession || pair.pc.signalingState !== "have-local-offer") return;
        await pair.pc.setRemoteDescription(donnees);
        await viderCandidats(pair);
    } else if (s.Type === "ice") {
        if (!pair || pair.session !== s.DeSession) {
            v.attente.push(s);                                    // arrivé avant l'offre
            v.attente = v.attente.slice(-60);
            return;
        }
        if (pair.distante) { try { await pair.pc.addIceCandidate(donnees); } catch (e) {} }
        else pair.candidats.push(donnees);
    }
}
async function viderCandidats(pair) {
    pair.distante = true;
    const enAttente = v.attente.filter(s => s.De === pair.id && s.DeSession === pair.session);
    v.attente = v.attente.filter(s => !enAttente.includes(s));
    const tous = [...enAttente.map(s => { try { return JSON.parse(s.Donnees); } catch (e) { return null; } }), ...pair.candidats].filter(Boolean);
    pair.candidats = [];
    for (const c of tous) { try { await pair.pc.addIceCandidate(c); } catch (e) {} }
}

// ---------------------------------------------------------------------
//  LE SON DES AUTRES : un volume par joueur, et l'écoute de leur niveau
// ---------------------------------------------------------------------
function brancherSon(pair, flux) {
    if (pair.audio) return;
    // (Chrome) un flux distant ne s'entend dans Web Audio que s'il est aussi
    // joué par un élément audio — muet ici : c'est Web Audio qui le fait entendre.
    const audio = document.createElement("audio");
    audio.autoplay = true; audio.playsInline = true; audio.muted = true;
    audio.srcObject = flux;
    audio.className = "vocal-son";
    document.body.appendChild(audio);
    audio.play().catch(() => {});
    pair.audio = audio;
    if (!v.ctx) { audio.muted = false; return; }              // sans Web Audio : l'élément joue seul
    try {
        pair.source = v.ctx.createMediaStreamSource(flux);
        pair.gain = v.ctx.createGain();
        pair.analyseur = v.ctx.createAnalyser();
        pair.analyseur.fftSize = 512;
        pair.source.connect(pair.analyseur);
        pair.source.connect(pair.gain);
        pair.gain.connect(v.ctx.destination);
        appliquerVolumes(true);
    } catch (e) { audio.muted = false; }
}
function volumeDe(id) {
    if (v.sourdine || v.muets.has(id)) return 0;
    return v.lecture ? VOLUME_LECTURE : 1;
}
function appliquerVolumes(net) {
    v.pairs.forEach((pair, id) => {
        const cible = volumeDe(id);
        if (pair.gain && v.ctx) {
            if (net) pair.gain.gain.value = cible;
            else pair.gain.gain.setTargetAtTime(cible, v.ctx.currentTime, 0.25);   // en douceur
        } else if (pair.audio && !pair.audio.muted) pair.audio.volume = cible;
    });
}
const tampon = new Float32Array(512);
function niveau(analyseur) {
    if (!analyseur) return 0;
    analyseur.getFloatTimeDomainData(tampon);
    let s = 0;
    for (let i = 0; i < tampon.length; i++) s += tampon[i] * tampon[i];
    return Math.sqrt(s / tampon.length);
}
function ecouterNiveaux() {
    const t = Date.now();
    let change = false;
    const ouvert = v.micro === "ok" && !v.coupe && !v.dictee;
    if (ouvert && niveau(v.analyseLocale) > SEUIL_PAROLE) v.parleMoiJusqua = t + TENUE_PAROLE_MS;
    const parleMoi = ouvert && t < v.parleMoiJusqua;
    if (parleMoi !== v.parleMoi) { v.parleMoi = parleMoi; change = true; }
    v.pairs.forEach(pair => {
        if (pair.analyseur && niveau(pair.analyseur) > SEUIL_PAROLE) pair.jusqua = t + TENUE_PAROLE_MS;
        const p = t < pair.jusqua;
        if (p !== pair.parle) { pair.parle = p; change = true; }
    });
    if (change) majPoints();
}

// ---------------------------------------------------------------------
//  LE RÉCIT (grimoire_recit.js) : la dictée et la lecture
// ---------------------------------------------------------------------
// La dictée du RP : le micro du vocal se ferme (les autres n'entendent pas
// ce qu'on écrit, et la dictée a le micro pour elle) ; il se rouvre après.
window.addEventListener("ivalis-dictee", (ev) => {
    const active = !!(ev.detail && ev.detail.active);
    if (active === v.dictee) return;
    v.dictee = active;
    if (v.rejoint) {
        if (active) fermerMicro();
        else ouvrirMicro().then(publier);
        if (active) publier();
    }
    maj();
});
// Le Narrateur écrit, ou sa page attend ma « Lecture terminée » : les voix baissent.
window.addEventListener("ivalis-lecture", (ev) => {
    const active = !!(ev.detail && ev.detail.active);
    if (active === v.lecture) return;
    v.lecture = active;
    appliquerVolumes();
    maj();
});
window.addEventListener("pagehide", () => {
    if (v.rejoint && v.partie && moi()) deleteDoc(doc(db, "Vocal", v.partie, "Presents", moi())).catch(() => {});
});

window.GRIMOIRE_VOCAL = {
    entrer, sortir, rejoindre, quitter, couperMicro, basculerSourdine, basculerMuet,
    etat: () => ({ partie: v.partie, rejoint: v.rejoint, micro: v.micro, coupe: v.coupe, sourdine: v.sourdine, dictee: v.dictee,
                   lecture: v.lecture, parleMoi: v.parleMoi, muets: [...v.muets], session: v.session,
                   pairs: [...v.pairs.values()].map(p => ({ id: p.id, etat: p.pc.connectionState, parle: p.parle, volume: volumeDe(p.id),
                       gain: p.gain ? p.gain.gain.value : null })),
                   joueurs: joueursDeLaTable().map(id => ({ id, nom: nomDe(id), couleur: couleurDe(id), parle: parle(id) })) })
};
// Déjà en partie quand ce module arrive (il se charge après grimoire.js) : il entre.
try {
    const g = window.GRIMOIRE;
    if (g && g.enPartie && g.enPartie() && window.ID_PARTIE_COURANTE) entrer(window.ID_PARTIE_COURANTE);
} catch (e) {}
