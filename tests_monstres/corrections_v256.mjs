// LES CORRECTIONS DE LA v256.
//
//   1. « Sous les boutons du menu, fais une petite flèche beige pour remonter
//      en animation tous les boutons vers le haut. S'affiche alors le même
//      bouton que dans la page chatbox, en plus petit, dans le coin haut
//      droit ; si on clique dessus, ça rouvre le menu. »
//   2. « Quand un personnage monte de niveau, fais une popup avec l'avatar, et
//      en dessous l'animation de la jauge d'XP qui arrive au bout avec un bruit
//      de trompette, le niveau I qui change en grossissant pour le niveau II,
//      etc. selon le niveau. »
//   3. « Blessures visibles : quand une blessure peut se voir sur le long terme
//      et reste dans la chair, refais une image du personnage actuel avec
//      cette blessure, et rajoute la blessure dans la description du perso,
//      car l'IA se base sur le perso de référence : la blessure va disparaître
//      si on change d'armure. Ne fais ça que pour les blessures qui restent. »
import fs from 'fs';
import vm from 'vm';
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();
console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v256");
console.log("=========================================================");

// -------------------------------------------------------------------------
console.log("\n3a. LES BLESSURES QUI SE VOIENT (la table, hors page)");
{
    const ctx = { window: {}, Math };
    vm.runInNewContext(fs.readFileSync('/home/user/Ivalis/blessures.js', 'utf-8'), ctx);
    const W = ctx.window;
    const ou = (f, d) => (typeof f === "function" ? f : () => d);
    W.estBlessureVisible = ou(W.estBlessureVisible, false);
    W.signesAvecBlessures = ou(W.signesAvecBlessures, "");
    W.signesSansBlessure = ou(W.signesSansBlessure, "");
    W.promptBlessuresVisibles = ou(W.promptBlessuresVisibles, "");
    const visibles = W.TABLE_BLESSURES.filter(b => b.visible).map(b => b.id).sort();
    const attendues = ["BLE_AMPUTATION_BRAS", "BLE_AMPUTATION_DOIGTS", "BLE_AMPUTATION_MAIN", "BLE_COUPURE_FINE", "BLE_DEFIGURATION",
                       "BLE_MACHOIRE_FRACASSEE", "BLE_MUTILATION_MULTIPLE", "BLE_OEIL_BORGNE"];
    verifier("les huit blessures qui marquent le corps pour toujours", JSON.stringify(visibles) === JSON.stringify(attendues), visibles.join(","));
    verifier("…toutes définitives", W.TABLE_BLESSURES.filter(b => b.visible).every(b => b.duree.definitif));
    const jamais = ["BLE_LEVRE_FENDUE", "BLE_COUP_VISAGE", "BLE_BRULURE_ETENDUE", "BLE_AMPUTATION_PIED", "BLE_TYMPAN_CREVE", "BLE_POUMON_PERFORE",
                    "BLE_LESION_COLONNE", "BLE_DECHIRURE_MUSCULAIRE"];
    verifier("ni ce qui guérit, ni ce qui reste sous la peau, ni le pied (le portrait s'arrête aux genoux)",
             jamais.every(id => !W.estBlessureVisible(id)), jamais.filter(id => W.estBlessureVisible(id)).join(","));
    const avec = W.signesAvecBlessures("Tatouage de serpent sur l'avant-bras", ["BLE_OEIL_BORGNE"]);
    verifier("la description garde ses signes et reçoit la blessure", avec.startsWith("Tatouage de serpent sur l'avant-bras. Œil borgne : un œil crevé"), avec);
    verifier("…une seule fois, même rappelée", W.signesAvecBlessures(avec, ["BLE_OEIL_BORGNE", "BLE_OEIL_BORGNE"]) === avec);
    verifier("une blessure passagère n'y entre pas", W.signesAvecBlessures("", ["BLE_LEVRE_FENDUE"]) === "");
    verifier("retirée (DEV), sa phrase s'en va", W.signesSansBlessure(avec, "BLE_OEIL_BORGNE") === "Tatouage de serpent sur l'avant-bras",
             W.signesSansBlessure(avec, "BLE_OEIL_BORGNE"));
    const deux = W.signesAvecBlessures("", ["BLE_COUPURE_FINE", "BLE_AMPUTATION_MAIN"]);
    verifier("deux blessures, deux phrases", /^Coupure fine : .+\. Amputation d'une main : /.test(deux), deux);
    const perso = { blessures: [{ uid: "a", id: "BLE_OEIL_BORGNE", definitif: true }, { uid: "b", id: "BLE_GENOU_AFFAIBLI", combats: 1 }] };
    const prompt = W.promptBlessuresVisibles(perso);
    verifier("le passage du prompt : ses marques, cicatrisées, et elles seules", /cicatrisées/.test(prompt) && /œil crevé/.test(prompt) && !/genou/i.test(prompt), prompt);
    verifier("…rien pour un héros sans marque", W.promptBlessuresVisibles({ blessures: [] }) === "");
}

// -------------------------------------------------------------------------
await p.evaluate(() => {
  window.fermerStudioAnimation();
  const param = document.getElementById("conteneur-parametres");
  if (param) { param.style.display = "none"; param.classList.remove("ouvert"); }
  window.__sons = [];
  const vrai = window.jouerSonEvenement;
  window.jouerSonEvenement = (id, f) => { window.__sons.push(id); return vrai ? vrai(id, f) : false; };
});

console.log("\n1. LE MENU QUI SE RANGE");
{
  const r = await p.evaluate(async () => { try {
    const attendre = (ms) => new Promise(res => setTimeout(res, ms));
    const menu = document.getElementById("menu-lateral");
    try { localStorage.removeItem("ivalis_MENU_REPLIE"); } catch (e) {}
    menu.classList.remove("menu-replie");
    menu.style.display = "flex";
    await attendre(300);
    const fleche = document.getElementById("btn-replier-menu");
    const rouvrir = document.getElementById("btn-rouvrir-menu");
    const icones = [...menu.querySelectorAll(".icone-menu")];
    const param = icones[icones.length - 1].getBoundingClientRect();
    const f = fleche.getBoundingClientRect();
    const out = {
      derniere: menu.lastElementChild === fleche.parentElement,
      sous: f.top >= param.bottom - 4,
      centree: Math.abs((f.left + f.width / 2) - (param.left + param.width / 2)),
      couleur: getComputedStyle(fleche.querySelector("svg")).stroke,
      cacheAuDepart: getComputedStyle(rouvrir).display === "none"
    };
    // La flèche : les boutons s'envolent un à un.
    const hauts = () => [...menu.children].map(el => el.getBoundingClientRect().top);
    const avant = hauts();
    fleche.click();
    await attendre(230);
    const pendant = hauts();
    out.montent = pendant.some((t, i) => t < avant[i] - 20);
    out.leBasPartEnPremier = (avant[avant.length - 1] - pendant[pendant.length - 1]) > (avant[0] - pendant[0]);
    await attendre(1100);
    out.range = menu.classList.contains("menu-replie") && getComputedStyle(menu).visibility === "hidden";
    const b = rouvrir.getBoundingClientRect();
    out.bouton = getComputedStyle(rouvrir).display !== "none";
    out.coin = { droite: innerWidth - b.right, haut: b.top, largeur: b.width };
    out.memeImage = rouvrir.src === document.getElementById("btn-fermer-chat-nouveau").src;
    out.plusPetit = b.width < innerWidth * 0.04;
    out.memoire = localStorage.getItem("ivalis_MENU_REPLIE");
    // Une fenêtre cache le menu (la narration, le combat) : le petit bouton aussi.
    menu.style.display = "none"; await attendre(30);
    out.cacheAvecLeMenu = getComputedStyle(rouvrir).display === "none";
    menu.style.display = "flex"; await attendre(30);
    out.revientAvecLeMenu = getComputedStyle(rouvrir).display !== "none";
    // Le petit bouton : les boutons redescendent.
    rouvrir.click();
    await attendre(200);
    const redescente = hauts();
    out.redescendent = !menu.classList.contains("menu-replie") && redescente.some((t, i) => t < avant[i] - 20);
    await attendre(1200);
    const apres = hauts();
    out.enPlace = apres.every((t, i) => Math.abs(t - avant[i]) < 2);
    out.boutonParti = getComputedStyle(rouvrir).display === "none";
    out.memoire2 = localStorage.getItem("ivalis_MENU_REPLIE");
    // La narration : son bouton « Afficher l'interface » ramène un menu rangé.
    window.replierMenuLateral({ sansAnimation: true });
    window.ouvrirChatbox();
    await attendre(30);
    out.chatCache = getComputedStyle(rouvrir).display === "none" && menu.style.display === "none";
    window.afficherMenusDansChat();
    await attendre(30);
    out.chatDeplie = !menu.classList.contains("menu-replie") && menu.style.display !== "none" && getComputedStyle(rouvrir).display === "none";
    window.fermerToutesLesFenetres();
    return out;
  } catch (e) { return { erreur: e.message }; } });
  verifier("la flèche : dernier élément du menu, sous Paramètres, centrée sous les icônes",
           r.derniere && r.sous && r.centree < 6, JSON.stringify({ sous: r.sous, centree: r.centree }));
  verifier("…beige", /rgb\(232, 213, 165\)/.test(r.couleur), r.couleur);
  verifier("le petit bouton n'est pas là tant que le menu est déplié", r.cacheAuDepart);
  verifier("la flèche touchée : les boutons remontent, ceux du bas d'abord", r.montent && r.leBasPartEnPremier, JSON.stringify(r));
  verifier("…puis le menu est rangé (invisible, intouchable)", r.range);
  verifier("le même bouton que la narration, plus petit, dans le coin haut droit",
           r.bouton && r.memeImage && r.plusPetit && !!r.coin && r.coin.droite < 60 && r.coin.haut < 60, JSON.stringify(r.coin));
  verifier("le choix reste sur ce poste", r.memoire === "1" && r.memoire2 === "0", `${r.memoire} → ${r.memoire2}`);
  verifier("une fenêtre qui cache le menu cache aussi le petit bouton ; il revient avec lui", r.cacheAvecLeMenu && r.revientAvecLeMenu);
  verifier("le petit bouton touché : les boutons redescendent à leur place", r.redescendent && r.enPlace && r.boutonParti, JSON.stringify(r));
  verifier("la narration : « Afficher l'interface » ramène un menu rangé", r.chatCache && r.chatDeplie);
}

// -------------------------------------------------------------------------
console.log("\n2. LA MONTÉE DE NIVEAU");
{
  const r = await p.evaluate(async () => { try {
    const attendre = (ms) => new Promise(res => setTimeout(res, ms));
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    ["H9", "H8"].forEach(id => localStorage.removeItem("ivalis_NIVEAU_VU_" + id));
    const portrait = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><rect width="40" height="60" fill="#2a6ad8"/></svg>');
    const heros = (xp, extra) => ({ idPersonnage: "H9", idJoueur: "J1", prenom: "Aldric", camp: "Allié", xp, urlCloudinary: portrait, ...extra });
    const out = { romains: [4, 9, 14, 40].map(n => window.chiffreRomain(n)).join(" ") };
    out.premier = window.surveillerMonteesDeNiveau([heros(650)]).length;
    out.rienAuPremierPassage = getComputedStyle(document.getElementById("voile-niveau") || document.body).display === "none"
                               || !document.getElementById("voile-niveau");
    window.__sons = [];
    out.nouveaux = window.surveillerMonteesDeNiveau([heros(1300)]).map(n => `${n.de}→${n.a}`);
    await attendre(200);
    const v = document.getElementById("voile-niveau");
    out.ouverte = !!v && getComputedStyle(v).display === "flex";
    const romain = () => (v.querySelector(".niveau-romain") || {}).textContent;
    out.depart = romain();
    out.image = !!v.querySelector(".niveau-portrait img") && v.querySelector(".niveau-portrait img").src.startsWith("data:image/svg");
    out.nom = (v.querySelector(".niveau-nom") || {}).textContent;
    const largeur = () => { const b = v.querySelector(".niveau-jauge-remplie"); return Math.round(b.offsetWidth / b.parentElement.clientWidth * 100); };
    out.jaugeDepart = largeur();
    // La jauge glisse vers le bout.
    await attendre(1000);
    out.jaugeEnRoute = largeur();
    // Les deux niveaux : la trompette deux fois, le chiffre qui grossit.
    let grossi = false;
    for (let i = 0; i < 60 && romain() !== "III"; i++) {
      const s = v.querySelector(".niveau-romain").getAnimations().length > 0;
      grossi = grossi || s;
      await attendre(100);
    }
    out.arrive = romain();
    out.grossi = grossi;
    await attendre(2200);
    out.trompettes = window.__sons.filter(s => s === "trompette-niveau").length;
    out.gains = [...v.querySelectorAll(".niveau-gains li")].map(li => li.textContent);
    out.jaugeFin = largeur();
    out.xp = (v.querySelector(".niveau-xp") || {}).textContent;
    out.bouton = v.querySelector(".niveau-continuer").classList.contains("visible");
    v.querySelector(".niveau-continuer").click();
    await attendre(500);
    out.fermee = getComputedStyle(v).display === "none";
    // Le héros d'un autre joueur : pas de popup ici.
    localStorage.removeItem("ivalis_NIVEAU_VU_H8");
    window.surveillerMonteesDeNiveau([{ idPersonnage: "H8", idJoueur: "J2", prenom: "Bryn", camp: "Allié", xp: 0 }]);
    out.autreJoueur = window.surveillerMonteesDeNiveau([{ idPersonnage: "H8", idJoueur: "J2", prenom: "Bryn", camp: "Allié", xp: 2600 }]).length;
    // Redescendu (DEV ▼) puis remonté : la fête revient ; jamais deux fois pour le même.
    window.surveillerMonteesDeNiveau([heros(800)]);
    out.redescente = getComputedStyle(v).display === "none";
    out.deuxFois = window.surveillerMonteesDeNiveau([heros(800)]).length;
    // L'écran pris par la fin du combat : la popup attend qu'il se libère.
    let voileFin = document.getElementById("fin-combat-voile");
    if (!voileFin) { voileFin = document.createElement("div"); voileFin.id = "fin-combat-voile"; document.body.appendChild(voileFin); }
    voileFin.style.display = "flex";
    window.__sons = [];
    out.remontee = window.surveillerMonteesDeNiveau([heros(1250)]).map(n => `${n.de}→${n.a}`);
    await attendre(1500);
    out.attendLaFin = getComputedStyle(v).display === "none";
    voileFin.style.display = "none";
    await attendre(1500);
    out.puisSAffiche = getComputedStyle(v).display === "flex";
    await attendre(3000);
    const bouton = v.querySelector(".niveau-continuer");
    if (bouton) bouton.click();
    await attendre(500);
    out.son = typeof (window.SONS_EVENEMENTS || {})["trompette-niveau"] === "function";
    return out;
  } catch (e) { return { erreur: e.message }; } });
  const src = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
  verifier("les chiffres romains", r.romains === "IV IX XIV XL", r.romains);
  verifier("au premier passage, le niveau est retenu sans fête", r.premier === 0 && r.rienAuPremierPassage);
  verifier("650 → 1 300 XP : deux niveaux d'un coup (I → III)", JSON.stringify(r.nouveaux) === '["1→3"]', JSON.stringify(r.nouveaux));
  verifier("la popup : l'avatar, le nom, le niveau I", r.ouverte && r.image && r.nom === "Aldric" && r.depart === "I", JSON.stringify(r));
  verifier("la jauge part de l'XP déjà gagnée (650 / 700) et glisse vers le bout", r.jaugeDepart >= 90 && r.jaugeDepart <= 94,
           `${r.jaugeDepart} %, en route ${r.jaugeEnRoute} %`);
  verifier("le chiffre change en grossissant : II puis III", r.arrive === "III" && r.grossi, `${r.arrive} ${r.grossi}`);
  verifier("la trompette à chaque niveau", r.trompettes === 2, `${r.trompettes}`);
  verifier("ce que chaque niveau apporte", JSON.stringify(r.gains) === '["Niveau II : +1 compétence","Niveau III : Talent mineur"]', JSON.stringify(r.gains));
  verifier("la jauge finit sur l'XP du niveau III (100 / 600 → 17 %)", Math.abs(r.jaugeFin - 17) <= 2, `${r.jaugeFin} % · ${r.xp}`);
  verifier("« Continuer » referme la popup", r.bouton && r.fermee);
  verifier("le héros d'un autre joueur : rien sur ce poste", r.autreJoueur === 0);
  verifier("redescendu (DEV) : rien ; le même niveau : jamais deux fois", r.redescente && r.deuxFois === 0);
  verifier("la fin du combat à l'écran : la popup attend, puis s'affiche", JSON.stringify(r.remontee) === '["2→3"]' && r.attendLaFin && r.puisSAffiche,
           JSON.stringify(r.remontee));
  verifier("le son de trompette existe dans la Fabrique", r.son);
  verifier("l'écoute des fiches la déclenche, quel que soit le poste qui écrit l'XP",
           /surveillerMonteesDeNiveau\(persos\)/.test(src) && /montee_niveau\.js\?v=\d+/.test(fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8')));
}

// -------------------------------------------------------------------------
console.log("\n3b. LA BLESSURE QUI SE VOIT : LA DESCRIPTION ET LE PORTRAIT");
{
  const r = await p.evaluate(async () => { try {
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    window.ID_PARTIE_COURANTE = "PARTIE";
    window.__portraits = [];
    window.__vraiDessiner = window.__vraiDessiner || window.dessinerBlessuresSurAvatar;
    window.dessinerBlessuresSurAvatar = async (id, ids) => { window.__portraits.push({ id, ids }); return ""; };
    const base = { camp: "Allié", race: "Humain", PV_Max: 60, Fatigue_Max: 100, caracs: { con: 10 }, talents: {}, deckEquipe: ["K1"] };
    const heros = () => [
      { ...base, idPersonnage: "P1", prenom: "Aldric", idJoueur: "J1", PV_Actuels: 0, signes: "Tatouage de serpent", blessures: [] },
      { ...base, idPersonnage: "P2", prenom: "Bryn", idJoueur: "J2", PV_Actuels: 0, signes: "Œil borgne : un œil crevé, laiteux et aveugle, traversé d'une cicatrice verticale",
        blessures: [{ uid: "o", id: "BLE_OEIL_BORGNE", definitif: true }] },
      { ...base, idPersonnage: "P3", prenom: "Cass", idJoueur: "J3", PV_Actuels: 0, signes: "", blessures: [] }];
    const tirage = { P1: "BLE_OEIL_BORGNE", P2: "BLE_OEIL_BORGNE", P3: "BLE_TYMPAN_CREVE" };
    const vrai = window.tirerBlessures;
    window.tirerBlessures = (p) => ({ tirages: [{ de: 34, bonus: 0, retraits: 0, score: 34, id: tirage[p.idPersonnage] }], veinardConsomme: false });
    window.__partie = { ID_Rencontre: "R256" };
    window.PARTIE_DATA = { ...window.__partie };
    window.modifierPartie = async (fn) => { const res = fn(JSON.parse(JSON.stringify(window.__partie))); if (!res) return null; Object.assign(window.__partie, res.maj); return res.resultat; };
    window.PERSOS_PARTIE = heros(); window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    window.MONSTRES_PARTIE = [];
    window.__majs = [];
    try { await window.cloturerCombat("defaite"); } finally { window.tirerBlessures = vrai; }
    await new Promise(res => setTimeout(res, 50));
    const maj = (id) => (window.__majs.find(m => m.chemin === "Personnages/" + id && m.data.Blessures) || {}).data || {};
    const fiches = { p1: maj("P1"), p2: maj("P2"), p3: maj("P3"), local: window.PERSOS_PARTIE[0].signes };
    // Le prompt de l'armure redit les blessures ; sans héros, il ne change pas.
    const armure = { nom: "Cuirasse", casquePorte: false };
    const sansHeros = window.promptAvatarArmure(armure);
    const avecHeros = window.promptAvatarArmure(armure, { blessures: [{ uid: "o", id: "BLE_OEIL_BORGNE", definitif: true }] });
    // DEV : retirer la blessure retire sa phrase.
    window.BLESSURES_FICHE = { ...window.PERSOS_PARTIE[0] };
    window.__majs = [];
    await window.retirerBlessureDev(window.PERSOS_PARTIE[0].blessures[0].uid);
    const dev = (window.__majs[0] || {}).data || {};
    return { ...fiches, portraits: window.__portraits, sansHeros, avecHeros, dev };
  } catch (e) { return { erreur: e.message, p1: {}, p2: {}, p3: {}, portraits: [], dev: {} }; } });
  verifier("Aldric perd un œil : la description le dit, dans la même écriture que la blessure",
           /^Tatouage de serpent\. Œil borgne : un œil crevé/.test(r.p1.Signes_Distinctif || "") && (r.p1.Blessures || []).length === 1, r.p1.Signes_Distinctif);
  verifier("…tout de suite à l'écran aussi", /Œil borgne/.test(r.local || ""), r.local);
  verifier("…et son portrait est redessiné avec la blessure", JSON.stringify(r.portraits) === '[{"id":"P1","ids":["BLE_OEIL_BORGNE"]}]',
           JSON.stringify(r.portraits));
  verifier("Bryn était déjà borgne : ni nouvelle phrase, ni nouveau portrait", r.p2.Signes_Distinctif === undefined
           && !r.portraits.some(x => x.id === "P2"), JSON.stringify(r.p2.Signes_Distinctif));
  verifier("Cass, un tympan crevé (ne se voit pas) : rien", r.p3.Signes_Distinctif === undefined && !r.portraits.some(x => x.id === "P3"));
  verifier("le prompt du rhabillage redit la blessure (le portrait de référence ne l'a pas)",
           !/BLESSURES/.test(r.sansHeros) && /BLESSURES QUI ONT MARQUÉ SON CORPS[^]*œil crevé/.test(r.avecHeros) && /TÊTE NUE/.test(r.avecHeros));
  verifier("retirée par le DEV : sa phrase quitte la description", r.dev.Signes_Distinctif === "Tatouage de serpent", JSON.stringify(r.dev));
}

console.log("\n3c. LE PORTRAIT BLESSÉ : UNE IMAGE, LA MARQUE, RIEN D'AUTRE");
{
  const r = await p.evaluate(async () => { try {
    window.dessinerBlessuresSurAvatar = window.__vraiDessiner;
    const envois = [];
    const vraiFetch = window.fetch;
    window.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("api.openai.com")) {
        const form = init.body;
        envois.push({ images: form.getAll("image[]").length, prompt: form.get("prompt") });
        return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), { status: 200 });
      }
      if (u.includes("api.cloudinary.com")) return new Response(JSON.stringify({ secure_url: "https://res.cloudinary.com/x/image/upload/v1/abc.png", public_id: "abc" }), { status: 200 });
      return vraiFetch(url, init);
    };
    window.peutIllustrerLesObjets = () => true;
    window.clesApiObjets = () => ({ openai: "k", cloudName: "c", cloudKey: "k", cloudSecret: "s" });
    window.imageVersBlobPng = async () => new Blob(["x"], { type: "image/png" });
    window.signatureCloudinaryIvalis = async () => "sig";
    window.detourerFondMagenta = async () => new Blob(["y"], { type: "image/png" });
    window.__poses = [];
    window.poserAvatarEquipe = async (id, url) => { window.__poses.push({ id, url }); };
    window.PERSOS_PARTIE = [{ idPersonnage: "P1", prenom: "Aldric", urlCloudinary: "https://res.cloudinary.com/x/avatar-cuirasse.png" }];
    const url = await window.dessinerBlessuresSurAvatar("P1", ["BLE_OEIL_BORGNE", "BLE_GENOU_AFFAIBLI"]);
    const rien = await window.dessinerBlessuresSurAvatar("P1", ["BLE_TYMPAN_CREVE"]);
    window.fetch = vraiFetch;
    return { envois, url, poses: window.__poses, rien };
  } catch (e) { return { erreur: e.message, envois: [], poses: [] }; } });
  const e = r.envois[0] || {};
  verifier("une seule image envoyée au dessinateur : le héros tel qu'il est", r.envois.length === 1 && e.images === 1, JSON.stringify(r.envois.map(x => x.images)));
  verifier("le prompt : à l'identique, sauf la marque (cicatrisée), sur fond magenta",
           /À L'IDENTIQUE/.test(e.prompt || "") && /œil crevé/.test(e.prompt || "") && /cicatrisées/.test(e.prompt || "") && /MAGENTA/.test(e.prompt || "")
           && !/genou/i.test(e.prompt || ""));
  verifier("l'image détourée devient son avatar affiché", r.poses.length === 1 && r.poses[0].id === "P1" && /q_auto,f_auto/.test(r.poses[0].url),
           JSON.stringify(r.poses));
  verifier("une blessure qui ne se voit pas : aucun dessin", r.rien === "" && r.envois.length === 1);
}

await fin();
