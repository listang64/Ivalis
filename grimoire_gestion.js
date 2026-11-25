// =========================================================================
//  IVALIS — LA GESTION DU CAMP (v481)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 4) :
//    · « Gestion du camp : ouvre une double page de gestion. On y assigne les
//      rôles, on y voit la trésorerie, les provisions, le bilan actuel, etc., et
//      la liste des personnages du camp (cliquer sur l'un d'eux ouvre ses fils
//      invisibles). »
//    · L'assignation des tâches, bloquée pendant qu'une expédition est en cours
//      hors du camp, avec leurs limites (2 cuisiniers, 1 soigneur, 1 forgeron,
//      1 éclaireur, 2 entraîneurs avec chacun sa recrue de niveau inférieur) ;
//      l'intendant (en plus d'un autre rôle), obligatoire dès qu'au moins un
//      personnage reste au camp.
//    · Commercer : à l'assignation, combien de provisions acheter (ou vendre).
//  Les règles : camp_pur.js ; les écritures : camp.js (window.CAMP).
// =========================================================================
const G = () => window.GRIMOIRE;
const C = () => window.CAMP;
const R = () => (window.CAMP && window.CAMP.regles) || null;
const D = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins) || {};
const lavis = (...a) => (D().lavis ? D().lavis(...a) : "");
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const signe = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v);
const FLEURON = `<svg class="fleuron fleuron-groupe" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
const TEINTE_GESTION = { couleurs: ["#c49a62", "#dcbc8c", "#a87d4c"], opacite: 0.45, nom: "gestion" };
const TEINTE_MEMBRES = { couleurs: ["#5e7f59", "#7d9c6f", "#476944"], opacite: 0.3, nom: "membres-camp" };

let pages = null;                  // { g, d }
let infos = {}, infosLues = 0, brouillons = {}, note = { texte: "", le: 0 };
const sig = { g: "", d: "" };

function creer() {
    if (pages) return pages;
    const page = (cote) => { const el = document.createElement("div"); el.className = `page-grimoire page-papier ${cote} page-fiches page-gestion`; el.id = "grimoire-gestion-" + cote[0]; return el; };
    pages = { g: page("gauche"), d: page("droite") };
    return pages;
}
function poser() {
    const g = G();
    if (!g || typeof g.definirGestion !== "function" || !g.enPartie || !g.enPartie()) return;
    const { g: pg, d: pd } = creer();
    const avant = g.pagesGestion();
    if (avant.length === 2 && avant[0] === pg && avant[1] === pd) return;
    g.definirGestion([pg, pd]);
}
async function lireInfos(force) {
    if (!C() || !C().infosMembres) return infos;
    if (!force && Date.now() - infosLues < 15000) return infos;
    infosLues = Date.now();
    try { infos = await C().infosMembres(); } catch (e) { console.warn("[Gestion] Les membres :", e); }
    maj();
    return infos;
}

// ---------------------------------------------------------------------
//  LA PAGE DE GAUCHE : la trésorerie, les provisions, la jauge, le bilan, l'intendant
// ---------------------------------------------------------------------
function htmlGauche() {
    const camp = C() && C().lire(), P = R();
    const retour = `<button type="button" class="lien-fiche retour-gestion" data-action="gestion" data-gc="camp">‹ Le camp</button>`;
    if (!camp || !P) return `<div class="contenu-page page-gestion-gauche">
        <div class="entete-groupe">${lavis(TEINTE_GESTION, "gestion-titre")}<span class="titre-page-fiche">Gestion du camp</span></div>${FLEURON}
        <p class="fiche-attente">Le clan n'a pas encore de camp.</p></div>`;
    const partis = C().partis(), b = P.bilanDuJour(camp, infos, partis);
    const jauge = Number((camp.Ressources || {}).Jauge), terrain = (camp.Ressources || {}).Terrain || "";
    const prov = Number(camp.Provisions) || 0;
    const tiendra = b.net < 0 && prov > 0 ? Math.floor(prov / -b.net) : null;
    const candidats = Object.keys(camp.Membres || {}).filter(id => !P.peutEtreIntendant(camp, id, partis));
    const bloque = C().postesBloques();
    const manque = P.intendantManquant(camp, partis);
    return `<div class="contenu-page page-gestion-gauche defile-fiche">
        <div class="entete-groupe">${lavis(TEINTE_GESTION, "gestion-titre")}<span class="titre-page-fiche">Gestion du camp</span></div>${FLEURON}
        ${retour}
        ${camp.Deplacement && camp.Deplacement.En_Cours ? `<p class="avis-gestion route-gestion">Le camp est en route depuis ${Number(camp.Deplacement.Jours) || 0} jour${(Number(camp.Deplacement.Jours) || 0) > 1 ? "s" : ""} : ${Number(camp.Provisions) || 0} provisions, −${P.coutDuDeplacement(camp, infos)} par jour ; ${Math.round(P.risqueDeLaRoute(camp, infos) * 100)} % de risque d'un événement chaque jour.</p>`
          : bloque ? `<p class="avis-gestion">Une expédition est en cours : les postes du camp ne changent pas avant son retour.</p>` : ""}
        <div class="tresor-gestion">
          <div class="case-gestion"><b data-gestion="caisse">${Number(camp.Caisse) || 0}</b><span>drachmes dans la caisse</span></div>
          <div class="case-gestion"><b data-gestion="provisions">${prov}</b><span>provisions</span></div>
        </div>
        <div class="sous-titre-groupe">Les ressources alentour</div>
        <div class="jauge-gestion" title="La jauge des ressources naturelles autour du camp">
          <span class="barre-jauge-gestion"><i style="width:${Number.isFinite(jauge) ? Math.max(0, Math.min(100, jauge)) : 0}%"></i></span>
          <b data-gestion="jauge">${Number.isFinite(jauge) ? jauge : "?"}</b>/100
        </div>
        <p class="ligne-gestion">${terrain ? `${echapper(terrain)} · ` : ""}la chasse et la cueillette rendent <b data-gestion="rendement">${Math.round(b.rendement * 100)} %</b></p>
        <div class="sous-titre-groupe">Le bilan du jour</div>
        <ul class="bilan-gestion">
          <li><span>Production</span><b data-gestion="production">${signe(b.production)}</b>
            <small>${b.chasse || b.cueillette ? `chasse ${b.chasse}, cueillette ${b.cueillette}${b.rendement < 1 ? ` × ${Math.round(b.rendement * 100)} %` : ""}` : "personne ne chasse ni ne cueille"}</small></li>
          <li><span>Consommation</span><b data-gestion="consommation">${signe(-b.consommation)}</b>
            <small>${b.presents} au camp${b.cuisine ? `, la cuisine en épargne ${b.cuisine}` : ""}</small></li>
          <li class="net-gestion${b.net < 0 ? " deficit" : ""}"><span>Bilan</span><b data-gestion="net">${signe(b.net)}</b><small>provisions par jour</small></li>
        </ul>
        ${tiendra !== null ? `<p class="avis-gestion">À ce rythme, les provisions dureront ${tiendra} jour${tiendra > 1 ? "s" : ""}.</p>` : ""}
        <div class="sous-titre-groupe">L'intendant</div>
        <p class="ligne-gestion petite">Il raconte au retour des joueurs ce qui s'est passé au camp (en plus de sa tâche).</p>
        <select class="select-gestion select-intendant" data-gc="intendant"${bloque ? " disabled" : ""}>
          <option value="">— personne —</option>
          ${candidats.map(id => `<option value="${echapper(id)}"${camp.Intendant === id ? " selected" : ""}>${echapper(nomDe(id, camp))}</option>`).join("")}
        </select>
        ${manque ? `<p class="avis-gestion">Il faut un intendant dès qu'un personnage reste au camp.</p>` : ""}
        ${camp.Conseil_Extraordinaire ? `<p class="avis-gestion">Un conseil extraordinaire doit se réunir : ${echapper(camp.Conseil_Extraordinaire.Raison || "")}</p>` : ""}
        ${(camp.Sujets_Conseil || []).length ? `<p class="avis-gestion">Le prochain conseil devra en parler : ${(camp.Sujets_Conseil || []).map(x => echapper(x.Texte || "")).join(" ")}</p>` : ""}
        ${htmlTache(camp)}
        ${htmlJournal(camp)}
        ${estDev() ? `<button type="button" class="lien-dev jour-dev-gestion" data-action="gestion" data-gc="jour-dev">Faire passer un jour au camp (DEV)</button>` : ""}
        <p class="note-gestion${note.texte && Date.now() - note.le < 4000 ? " visible" : ""}" aria-live="polite">${echapper(note.texte)}</p>
      </div>`;
}
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
// (v486) LA TÂCHE EN COURS, et « quand l'expédition revient au camp, on a la possibilité d'annuler la tâche en cours ».
function htmlTache(camp) {
    const mec = (window.PARTIE_DATA || {}).Mission_En_Cours;
    const tv = camp.Tache_Votee, P = R() || {};
    if (!(mec && mec.Id) && !(tv && P.TACHES_A_BOUTON && P.TACHES_A_BOUTON[tv.Type])) return "";
    const annuler = mec && mec.Id && camp.Annulation_Tache && camp.Annulation_Tache.Mission === mec.Id;
    return `<div class="sous-titre-groupe">La tâche en cours</div>
        <p class="ligne-gestion">${mec && mec.Id ? echapper(mec.Titre || "") : `${echapper(tv.Titre)} — par ${echapper(P.TACHES_A_BOUTON[tv.Type])}`}</p>
        ${annuler ? `<button type="button" class="lien-fiche annuler-tache-gestion" data-action="gestion" data-gc="annuler-tache">Annuler la tâche en cours (vote du groupe)</button>` : ""}`;
}
// (v482) LES DERNIERS JOURS DU CAMP : son journal (la journée du camp, camp_pur.js).
function htmlJournal(camp) {
    const jours = (Array.isArray(camp.Journal) ? camp.Journal : []).slice(-3).reverse();
    if (!jours.length) return "";
    return `<div class="sous-titre-groupe">Les derniers jours</div>
        <div class="journal-gestion">${jours.map(j => `<div class="jour-gestion"><b>${echapper(j.Date_Jeu || `Jour ${j.Jour || "?"}`)}</b>
          <ul>${(j.Lignes || []).map(l => `<li>${echapper(l)}</li>`).join("")}</ul></div>`).join("")}</div>`;
}
const nomDe = (id, camp) => ((infos[id] || {}).nom) || (((camp || {}).Membres || {})[id] || {}).Nom || id;

// ---------------------------------------------------------------------
//  LA PAGE DE DROITE : les membres du camp et leur tâche
// ---------------------------------------------------------------------
function htmlMembre(id, camp, partis, bloque) {
    const P = R(), mb = camp.Membres[id] || {}, i = infos[id] || {};
    const moral = Number.isFinite(Number(mb.Moral)) ? Number(mb.Moral) : 60;
    const themes = P.estThemes(id, mb), parti = partis.includes(id);
    const portrait = i.portrait ? `<img src="${echapper(i.portrait)}" alt="" draggable="false">` : `<span>${echapper(String(nomDe(id, camp)).slice(0, 1).toUpperCase())}</span>`;
    const qui = themes ? "Le narrateur du clan" : i.heros ? `Héros${i.joueur === moi() ? " (à toi)" : ""}` : (i.occupation || "Membre du clan");
    const voulu = (brouillons[id] && brouillons[id].tache) !== undefined ? brouillons[id].tache : (mb.Tache || "");
    let controle;
    if (themes) controle = `<span class="tache-fixe">Part avec chaque expédition</span>`;
    else if (parti) controle = `<span class="tache-fixe">En expédition</span>`;
    else {
        const options = [`<option value="">Repos</option>`].concat(Object.keys(P.TACHES).map(t => {
            const T = P.TACHES[t], m = P.mDeTache(t, i.caracs);
            const plein = T.max && Object.keys(camp.Membres).filter(x => x !== id && camp.Membres[x].Tache === t).length >= T.max;
            return `<option value="${t}"${voulu === t ? " selected" : ""}${plein && voulu !== t ? " disabled" : ""}>${T.nom} (m ${m >= 0 ? "+" : "−"}${Math.abs(m)})${plein && voulu !== t ? " — complet" : ""}</option>`;
        })).join("");
        controle = `<select class="select-gestion select-tache" data-gc="tache" data-id="${echapper(id)}"${bloque ? " disabled" : ""} title="${echapper(voulu ? P.TACHES[voulu].aide : "Sans tâche : +3 de moral par jour, et ses blessures guérissent plus vite.")}">${options}</select>`;
        if (voulu === "entrainer") controle += htmlRecrue(id, camp, partis, bloque, mb);
        if (voulu === "commercer") controle += htmlCommerce(id, camp, bloque, mb);
    }
    const histo = (Array.isArray(mb.Moral_Historique) ? mb.Moral_Historique : []).slice(-1)[0];
    return `<li class="membre-gestion${parti ? " parti" : ""}" data-membre="${echapper(id)}">
        <button type="button" class="portrait-gestion" data-action="gestion" data-gc="ame" data-id="${echapper(id)}" title="Ses fils invisibles">${portrait}</button>
        <div class="corps-membre-gestion">
          <div class="ligne-nom-gestion"><button type="button" class="nom-gestion" data-action="gestion" data-gc="ame" data-id="${echapper(id)}">${echapper(nomDe(id, camp))}</button>
            <span class="qui-gestion">${echapper(qui)} · niv. ${Number(i.niveau) || 1}</span>${camp.Intendant === id ? `<span class="badge-intendant">intendant</span>` : ""}</div>
          <div class="moral-gestion" title="Moral : ${moral}/100 (${echapper(P.effetDuMoral(moral))})${histo ? ` — dernier changement : ${histo.Delta > 0 ? "+" : ""}${histo.Delta}, ${echapper(histo.Raison)}` : ""}">
            <span>Moral</span><span class="barre-moral-gestion${moral < 30 ? " bas" : moral >= 80 ? " haut" : ""}"><i style="width:${moral}%"></i></span><b>${moral}</b></div>
          <div class="tache-gestion">${controle}</div>
        </div></li>`;
}
function htmlRecrue(id, camp, partis, bloque, mb) {
    const P = R(), nE = Number((infos[id] || {}).niveau) || 1;
    const possibles = Object.keys(camp.Membres).filter(r => r !== id && !partis.includes(r) && !P.estThemes(r, camp.Membres[r]) && (Number((infos[r] || {}).niveau) || 1) < nE);
    const choisie = (brouillons[id] && brouillons[id].recrue) || mb.Recrue || "";
    if (!possibles.length) return `<span class="avis-gestion petit">Personne au camp n'a un niveau inférieur au sien.</span>`;
    return `<select class="select-gestion select-recrue" data-gc="recrue" data-id="${echapper(id)}"${bloque ? " disabled" : ""}>
        <option value="">— sa recrue —</option>${possibles.map(r => `<option value="${echapper(r)}"${choisie === r ? " selected" : ""}>${echapper(nomDe(r, camp))} (niv. ${Number((infos[r] || {}).niveau) || 1})</option>`).join("")}</select>`;
}
function htmlCommerce(id, camp, bloque, mb) {
    const P = R(), m = P.mDeTache("commercer", (infos[id] || {}).caracs), max = P.maxCommerce(m);
    const b = brouillons[id] || {}, c = mb.Commerce || {};
    const sens = b.sens || c.Sens || "achat", q = b.quantite != null ? b.quantite : (c.Quantite || Math.min(max, 5));
    const prix = P.prixCommerce(sens, q, m);
    const fait = mb.Tache === "commercer" && c.Sens === sens && Number(c.Quantite) === Number(q) && !brouillons[id];
    return `<div class="commerce-gestion" data-id="${echapper(id)}">
        <select class="select-gestion" data-gc="sens" data-id="${echapper(id)}"${bloque ? " disabled" : ""}><option value="achat"${sens === "achat" ? " selected" : ""}>acheter</option><option value="vente"${sens === "vente" ? " selected" : ""}>vendre</option></select>
        <input type="number" class="quantite-gestion" data-gc="quantite" data-id="${echapper(id)}" min="1" max="${max}" step="1" value="${Number(q) || 1}"${bloque ? " disabled" : ""}>
        <span class="prix-gestion">provisions, pour <b>${prix}</b> drachmes (${max} au plus)</span>
        ${fait ? `<span class="badge-intendant">${c.Paye ? "payé" : "prévu"}</span>` : `<button type="button" class="lien-fiche valider-commerce" data-action="gestion" data-gc="commerce" data-id="${echapper(id)}"${bloque ? " disabled" : ""}>Valider</button>`}
      </div>`;
}
function htmlDroite() {
    const camp = C() && C().lire(), P = R();
    if (!camp || !P) return `<div class="contenu-page page-gestion-droite"></div>`;
    const partis = C().partis(), bloque = C().postesBloques();
    const ordre = (id) => P.estThemes(id, camp.Membres[id]) ? 0 : (infos[id] || {}).heros ? 1 : 2;
    const ids = Object.keys(camp.Membres || {}).sort((a, b) => ordre(a) - ordre(b) || String(nomDe(a, camp)).localeCompare(String(nomDe(b, camp)), "fr"));
    const ici = ids.filter(id => !partis.includes(id)).length;
    return `<div class="contenu-page page-gestion-droite defile-fiche">
        <div class="entete-groupe">${lavis(TEINTE_MEMBRES, "membres-camp-titre")}<span class="titre-page-fiche">Les membres du camp</span></div>${FLEURON}
        <div class="compte-suiveurs">${ids.length} membre${ids.length > 1 ? "s" : ""}${ici !== ids.length ? `, dont ${ici} au camp` : ""}</div>
        <ul class="liste-membres-gestion">${ids.map(id => htmlMembre(id, camp, partis, bloque)).join("")}</ul>
      </div>${(window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.FLECHE_DEFILE) || ""}`;
}

function maj(force) {
    if (!pages) return;
    const camp = C() && C().lire();
    const base = JSON.stringify([camp, infos, brouillons, C() && C().postesBloques && C().postesBloques(), C() && C().partis && C().partis(), (window.PARTIE_DATA || {}).Mission_En_Cours || null]);
    const actif = document.activeElement;
    // Ne pas redessiner sous les doigts de celui qui tape une quantité.
    if (!force && actif && pages.d.contains(actif) && actif.matches("input")) return;
    const sg = base + note.texte + (Date.now() - note.le < 4000);
    if (force || sg !== sig.g) { sig.g = sg; pages.g.innerHTML = htmlGauche(); }
    if (force || base !== sig.d) { sig.d = base; pages.d.innerHTML = htmlDroite(); }
}
// Un mot, puis la page suit la base (l'écoute de la partie revient juste après l'écriture).
function noter(texte) { note = { texte, le: Date.now() }; maj(true); setTimeout(() => maj(), 300); setTimeout(() => maj(), 4100); }

// ---------------------------------------------------------------------
//  LES GESTES
// ---------------------------------------------------------------------
async function agir(cible) {
    const gc = cible.dataset.gc, id = cible.dataset.id;
    if (gc === "camp") { son(); if (window.CAMP_SCENE) window.CAMP_SCENE.ouvrir(); return; }
    if (gc === "ame") {
        son();
        if (window.GRIMOIRE_LIENS) window.GRIMOIRE_LIENS.ouvrir({ id, nom: nomDe(id, C().lire()), depuisGestion: true });
        return;
    }
    if (gc === "annuler-tache") {
        son();
        const r = window.TACHE_EN_COURS ? await window.TACHE_EN_COURS.annulerTache() : null;
        return noter(r && r.abandon ? "La tâche est abandonnée." : r ? "Le vote pour annuler la tâche est lancé : chacun doit l'accepter (Tâche en cours)." : "La tâche n'a pas pu être annulée.");
    }
    if (gc === "jour-dev") {
        if (!estDev() || !C().journeeDuCamp) return;
        son();
        const r = await C().journeeDuCamp({ cle: "dev_" + Date.now() });
        return noter(r ? r.journal.join(" ") : "La journée n'a pas pu passer.");
    }
    if (gc === "commerce") {
        son();
        const b = brouillons[id] || {}, mb = (C().lire().Membres || {})[id] || {}, c = mb.Commerce || {};
        const champ = pages.d.querySelector(`.quantite-gestion[data-id="${CSS.escape(id)}"]`);
        const commerce = { sens: b.sens || c.Sens || "achat", quantite: champ ? Number(champ.value) : (b.quantite || c.Quantite) };
        const refus = await C().assignerTache(id, "commercer", { commerce });
        if (refus) return noter(refus);
        delete brouillons[id];
        noter(`${nomDe(id, C().lire())} ira ${commerce.sens === "vente" ? "vendre" : "acheter"} ${Math.floor(commerce.quantite)} provisions.`);
    }
}
async function surChangement(el) {
    const gc = el.dataset.gc, id = el.dataset.id;
    if (gc === "intendant") {
        son();
        const refus = await C().nommerIntendant(el.value || null);
        return refus ? noter(refus) : noter(el.value ? `${nomDe(el.value, C().lire())} est l'intendant du camp.` : "Le camp n'a plus d'intendant.");
    }
    if (gc === "tache") {
        son();
        const t = el.value || "";
        // Entraîner et commercer demandent un détail (la recrue, la quantité) avant d'être donnés.
        if (t === "entrainer" || t === "commercer") { brouillons[id] = { tache: t }; return maj(true); }
        delete brouillons[id];
        const refus = await C().assignerTache(id, t || null);
        if (refus) { noter(refus); return maj(true); }
        return noter(t ? `${nomDe(id, C().lire())} : ${R().TACHES[t].nom.toLowerCase()}.` : `${nomDe(id, C().lire())} se repose.`);
    }
    if (gc === "recrue") {
        son();
        if (!el.value) return;
        const refus = await C().assignerTache(id, "entrainer", { recrue: el.value });
        if (refus) return noter(refus);
        delete brouillons[id];
        return noter(`${nomDe(id, C().lire())} entraîne ${nomDe(el.value, C().lire())}.`);
    }
    if (gc === "sens" || gc === "quantite") {
        const b = brouillons[id] = brouillons[id] || { tache: "commercer" };
        if (gc === "sens") b.sens = el.value; else b.quantite = Math.max(1, Math.floor(Number(el.value) || 1));
        return maj(true);
    }
}
document.addEventListener("change", (ev) => {
    const el = ev.target && ev.target.closest && ev.target.closest(".page-gestion [data-gc]");
    if (el) surChangement(el);
});

// ---------------------------------------------------------------------
//  ALLER À LA GESTION
// ---------------------------------------------------------------------
function ouvrir() {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie() || typeof g.definirGestion !== "function") return false;
    poser();
    brouillons = {};
    maj(true);
    lireInfos(true);
    const aller = (essai) => {
        const i = g.indexDe(pages.g);
        if (i < 0) { if (essai < 30) setTimeout(() => aller(essai + 1), 100); return; }
        g.allerALaPage(i);
    };
    aller(0);
    return true;
}
function ouverte() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!pages || !pf || !g.ouvert || !g.ouvert() || !g.enPartie()) return false;
    const i = g.indexDe(pages.g), ici = pf.getCurrentPageIndex();
    return i >= 0 && (ici === i || ici === i + 1);
}
// La veille : en partie et avec un camp, la double page est dans le livre ; ouverte, elle suit la base.
setInterval(() => {
    if (document.hidden) return;
    try {
        const g = G();
        if (!g || !g.enPartie || !g.enPartie() || !(C() && C().lire())) return;
        poser();
        if (ouverte()) { lireInfos(false); maj(); }
    } catch (e) { console.warn("Le livre : la gestion du camp", e); }
}, 1000);

window.GESTION_CAMP = { ouvrir, ouverte, agir, maj: () => maj(true), pages: () => (pages ? [pages.g, pages.d] : []), lireInfos, infos: () => infos };
