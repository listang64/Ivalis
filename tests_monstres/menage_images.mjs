// LE MÉNAGE DES IMAGES ABANDONNÉES.
//
// Chaque objet du jeu est dessiné, et chaque dessin est hébergé sur Cloudinary.
// Un objet lâché, écrasé par un meilleur, ou qu'aucun héros n'a voulu au
// partage, s'en va de la base — mais son image, elle, y restait pour toujours.
// Même chose pour l'avatar habillé : il est redessiné à CHAQUE changement
// d'armure, et l'ancien n'était jamais retiré. Au rythme d'une partie, ça
// s'accumule en silence, et rien ne le dit.
//
// CE BANC PREND LE VRAI CODE. Les trois chemins qui abandonnent une image sont
// rejoués sur les vraies fonctions du jeu ; seul l'appel qui parle au réseau
// est bouchonné — c'est lui qu'on compte.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const extraire = (fichier, marqueur, finLigne = '};') => {
  const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
};

const SRC = [
  extraire('ia_master.js', 'const estTransformationCloudinary = (seg) =>',
           "    !seg.includes('.') && seg.split(',').every(part => /^[a-z]{1,3}_[^,/]+$/.test(part));"),
  extraire('ia_master.js', 'function idPublicCloudinary(urlImage) {', '}'),
  'window.idPublicCloudinary = idPublicCloudinary;',
  extraire('loot.js', 'window.imagesEncoreUtilisees = function(options) {'),
  extraire('loot.js', 'window.oublierImages = async function(urls, raison, options) {'),
  extraire('loot.js', 'window.champsPourObjet = function(objet, main) {'),
  // equiperObjet refuse un second bouclier : il s'appuie sur ces deux-là.
  extraire('loot.js', 'window.estBouclier = function(objet) {'),
  extraire('loot.js', 'window.mainsPossibles = function(perso, objet) {'),
  extraire('loot.js', 'window.equiperObjet = async function(idPersonnage, objet, main) {'),
  extraire('loot.js', 'window.lacherObjet = async function(idPersonnage, champ) {'),
  extraire('loot.js', 'window.appliquerEquipementEnRam = function(idPersonnage, maj) {'),
  extraire('loot.js', 'window.fermerFenetreButin = async function() {'),
  extraire('objets_ia.js', 'window.poserAvatarEquipe = async function(idPersonnage, url) {')
].join('\n\n');

const img = (nom) => `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1789/${nom}.png`;

// Un monde minimal : un héros équipé, et de quoi compter ce qui part.
function monde(extra) {
  const detruites = [];
  const ecrites = [];
  const w = {
    champDocVersFront: { Equip_Armure: "equipArmure", Equip_Main_Droite: "equipMainDroite",
                         Equip_Main_Gauche: "equipMainGauche" },
    PERSOS_PARTIE: [{ idPersonnage: "H1", prenom: "Pliors",
                      urlPortraitReference: img("portrait"),
                      urlAvatarEquipe: img("avatar_v1"),
                      urlCloudinary: img("avatar_v1"),
                      equipArmure: { uid: "a1", nom: "Cotte", emplacement: "Armure", image: img("cotte") },
                      equipMainDroite: { uid: "m1", nom: "Épée", emplacement: "Main_Droite", image: img("epee") },
                      equipMainGauche: null }],
    PARTIE_DATA: {}, RESERVE_CONNUE: {},
    jouerSonClic: () => {},
    supprimerImageCloudinary: async (url) => { detruites.push(url.split("/").pop()); },
    ...extra
  };
  const localStorage = { getItem: (k) => k === "ivalis_CLOUDINARY_API_SECRET" ? "secret" : null };
  const db = {};
  const doc = (...a) => ({ id: a[a.length - 1] });
  // appliquerEquipementEnRam redessine les encarts de la fiche si elle est
  // ouverte à l'écran. Il n'y a pas d'écran ici : un document qui ne trouve
  // jamais rien suffit, et le miroir en mémoire — ce qu'on mesure — se fait
  // quand même.
  const updateDoc = async (ref, maj) => { ecrites.push(maj); };
  const deleteField = () => "SUPPR";
  const document = { getElementById: () => null };
  new Function('window', 'localStorage', 'console', 'document', 'db', 'doc', 'updateDoc', 'deleteField', SRC)(
      w, localStorage, console, document, db, doc, updateDoc, deleteField);
  return { w, detruites, ecrites };
}

// Les promesses de ménage ne sont volontairement pas attendues par le jeu : le
// joueur n'a pas à patienter devant Cloudinary. Le banc, lui, doit les laisser
// finir avant de compter.
const souffler = () => new Promise(r => setTimeout(r, 30));

// =========================================================================
console.log("\n1. UN OBJET LÂCHÉ EMPORTE SON DESSIN");
// =========================================================================
{
  const { w, detruites, ecrites } = monde();
  await w.lacherObjet("H1", "Equip_Main_Droite");
  await souffler();
  verifier("l'emplacement est vidé en base", ecrites.some(m => m.Equip_Main_Droite === null),
           JSON.stringify(ecrites[0] || {}));
  verifier("ET SON IMAGE EST EFFACÉE", detruites.join() === "epee.png", detruites.join());
}

// =========================================================================
console.log("\n2. LÂCHER SON ARMURE EMPORTE AUSSI L'AVATAR HABILLÉ");
// =========================================================================
//  L'avatar montrait CETTE armure-là : sans elle, il ne resservira jamais.
{
  const { w, detruites } = monde();
  await w.lacherObjet("H1", "Equip_Armure");
  await souffler();
  verifier("l'armure et l'avatar partent ensemble",
           detruites.sort().join() === "avatar_v1.png,cotte.png", detruites.join());
  verifier("mais pas le portrait de référence, qui resservira",
           !detruites.includes("portrait.png"));
}

// =========================================================================
console.log("\n3. UN OBJET REMPLACÉ EMPORTE LE SIEN");
// =========================================================================
//  Sans sac dans Ivalis, l'écrasement est définitif.
{
  const { w, detruites } = monde();
  await w.equiperObjet("H1", { uid: "m2", nom: "Hache", emplacement: "Main_Droite", image: img("hache") });
  await souffler();
  verifier("L'ANCIENNE ARME EST EFFACÉE", detruites.join() === "epee.png", detruites.join());
  verifier("et la nouvelle, qu'on vient d'équiper, est épargnée",
           !detruites.includes("hache.png"));
}

// =========================================================================
console.log("\n4. UNE ARME À DEUX MAINS NE SE COMPTE QU'UNE FOIS");
// =========================================================================
//  Elle occupe les DEUX emplacements avec le MÊME dessin : relevée deux fois,
//  elle ne doit partir qu'une.
{
  const { w, detruites } = monde();
  const deuxMains = { uid: "d1", nom: "Espadon", emplacement: "Main_Droite",
                      deuxMains: true, image: img("espadon") };
  w.PERSOS_PARTIE[0].equipMainDroite = deuxMains;
  w.PERSOS_PARTIE[0].equipMainGauche = deuxMains;
  await w.equiperObjet("H1", { uid: "m3", nom: "Dague", emplacement: "Main_Droite", image: img("dague") });
  await souffler();
  verifier("UNE SEULE DEMANDE DE SUPPRESSION", detruites.length === 1, detruites.join());
  verifier("et c'est bien l'espadon", detruites[0] === "espadon.png", detruites[0]);
}

// =========================================================================
console.log("\n5. L'AVATAR D'AVANT S'EN VA À CHAQUE CHANGEMENT D'ARMURE");
// =========================================================================
{
  const { w, detruites } = monde();
  await w.poserAvatarEquipe("H1", img("avatar_v2"));
  await souffler();
  verifier("L'AVATAR PRÉCÉDENT EST EFFACÉ", detruites.join() === "avatar_v1.png", detruites.join());
  verifier("le nouveau est bien posé sur la fiche en mémoire",
           w.PERSOS_PARTIE[0].urlAvatarEquipe === img("avatar_v2"));

  // Reposer LE MÊME avatar ne doit rien effacer : ce serait supprimer celui
  // qu'on vient d'écrire.
  detruites.length = 0;
  await w.poserAvatarEquipe("H1", img("avatar_v2"));
  await souffler();
  verifier("reposer le même n'efface rien", detruites.length === 0, detruites.join());
}

// =========================================================================
console.log("\n6. LE BUTIN REFERMÉ EMPORTE CE QUE PERSONNE N'A PRIS");
// =========================================================================
{
  const pool = [
    { uid: "p1", image: img("delaisse_1") },                  // personne n'en a voulu
    { uid: "p2", image: img("delaisse_2") },
    { uid: "p3", image: img("gagne"), gagnant: "H1" }         // remporté : il vit désormais sur une fiche
  ];
  let ferme = 0;
  const { w, detruites } = monde({
    PARTIE_DATA: { Butin: { ouvert: true, pool } },
    modifierPartie: async (fn) => {
      const r = fn({ Butin: { ouvert: true, pool } });
      if (r) { ferme++; return true; }
      return null;
    }
  });
  await w.fermerFenetreButin();
  await souffler();
  verifier("le butin se referme", ferme === 1);
  verifier("LES OBJETS DÉLAISSÉS PARTENT",
           detruites.sort().join() === "delaisse_1.png,delaisse_2.png", detruites.join());
  verifier("ET CELUI QU'UN HÉROS A REMPORTÉ RESTE", !detruites.includes("gagne.png"));
}

// =========================================================================
console.log("\n7. UN SEUL POSTE FAIT LE MÉNAGE, PAS LES TROIS");
// =========================================================================
//  N'importe quel joueur peut refermer le butin, et tous peuvent cliquer en
//  même temps : la transaction n'en laisse passer qu'un. Sans cette garde,
//  trois postes lanceraient les mêmes suppressions.
{
  const pool = [{ uid: "p1", image: img("delaisse_1") }];
  const { w, detruites } = monde({
    PARTIE_DATA: { Butin: { ouvert: true, pool } },
    // Ce poste arrive trop tard : un autre a déjà refermé, la transaction
    // ne rend rien.
    modifierPartie: async () => null
  });
  await w.fermerFenetreButin();
  await souffler();
  verifier("CELUI QUI ARRIVE APRÈS COUP N'EFFACE RIEN", detruites.length === 0, detruites.join());
}

// =========================================================================
console.log("\n8. SANS LES CLÉS CLOUDINARY, ON NE PRÉTEND PAS AVOIR FAIT LE MÉNAGE");
// =========================================================================
{
  const detruites = [];
  const w = { PERSOS_PARTIE: [], PARTIE_DATA: {}, RESERVE_CONNUE: {},
              supprimerImageCloudinary: async (u) => { detruites.push(u); } };
  new Function('window', 'localStorage', 'console', SRC)(
      w, { getItem: () => null }, { log: () => {}, warn: () => {}, error: () => {} });
  const n = await w.oublierImages(img("orpheline"), "essai");
  verifier("rien n'est effacé", detruites.length === 0);
  verifier("et la fonction le dit : zéro image retirée", n === 0, String(n));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
