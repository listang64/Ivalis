// DES TENUES VARIÉES POUR LES ARMURES.
//
// Nico : « l'IA n'est pas assez variée sur les skins. Crée un algo qui
// choisisse parmi une liste définie de variations de tenue et l'envoie ensuite
// à l'IA qui crée l'image. Pour chaque type d'armure, au moins 30 variations
// issues de l'Antiquité au sens large — des Grecs aux Romains, ou la fantasy
// antique. Et pour les habits gris, pas de mode pouilleux déchiré : simples,
// mais bien. »
//
// variations_tenues.js porte les listes et le tirage ; objets_ia.js envoie la
// tenue tirée à MIA_Objets (qui décrit) et au dessinateur (qui dessine).
import fs from 'fs';

const RACINE = '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const SRC_VARIATIONS = fs.readFileSync(`${RACINE}/variations_tenues.js`, 'utf-8');
const fauxStockage = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const charger = (stockage = fauxStockage()) => {
    const w = {};
    new Function('window', 'localStorage', SRC_VARIATIONS)(w, stockage);
    return w;
};
// Un hasard reproductible.
const graine = (n) => { let x = n; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; };
const armure = (type, i, extra = {}) => ({ uid: "a" + i, nom: "Tenue", emplacement: "Armure", type, rarete: "Commun", ...extra });
const TYPES = ["Armure légère", "Armure intermédiaire", "Armure lourde"];

console.log("\n=========================================================");
console.log("  DES TENUES VARIÉES POUR LES ARMURES");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LES LISTES : AU MOINS 30 TENUES PAR TYPE, ANTIQUES ET SANS CASQUE");
// =========================================================================
{
    const w = charger();
    TYPES.forEach(t => {
        const l = w.VARIATIONS_TENUES[t] || [];
        const titres = new Set(l.map(v => v.titre));
        verifier(`${t} : ${l.length} tenues, toutes différentes et décrites`,
                 l.length >= 30 && titres.size === l.length && l.every(v => v.titre && v.description && v.description.length > 40));
    });
    const tout = TYPES.flatMap(t => w.VARIATIONS_TENUES[t]).map(v => (v.titre + " " + v.description).toLowerCase());
    const interdits = ["casque", "heaume", "coiffe", "visière", "diadème", "couronne", "mailles", "plates", "chevalier", "gothique", "médiév"];
    const fautes = tout.filter(x => interdits.some(m => x.includes(m)));
    verifier("aucune pièce de tête ni médiévale", fautes.length === 0, fautes.join(" | ").slice(0, 160));
    const pouilleux = ["déchir", "rapiéc", "troué", "guenille", "haillon", "miteu", "crasse"];
    verifier("aucune tenue en haillons", !tout.some(x => pouilleux.some(m => x.includes(m))));
    const cultures = ["athènes", "sparte", "rome", "romain", "égypt", "isis", "perse", "méd", "scythe", "étrusque", "phénicien",
                      "babylone", "gaul", "thrace", "carthage", "nabatéen", "minoen", "parthe", "ibère", "assyrien", "hittite",
                      "atlantide", "tartare", "hadès", "poséidon", "héphaïstos", "colchide"];
    const vues = cultures.filter(c => tout.some(x => x.includes(c)));
    verifier("des Grecs aux Romains, de la Perse aux steppes, et l'Antiquité fantastique", vues.length >= 22, `${vues.length} cultures`);
    verifier("au moins 12 palettes de couleurs", new Set(w.PALETTES_TENUES).size >= 12, String(w.PALETTES_TENUES.length));
}

// =========================================================================
console.log("\n2. LE TIRAGE");
// =========================================================================
{
    const w = charger();
    const lot = Array.from({ length: 30 }, (_, i) => armure("Armure légère", i));
    w.tirerVariationsTenues(lot, graine(7));
    verifier("30 armures légères dans un lot : 30 tenues différentes", new Set(lot.map(o => o.variationTenue.titre)).size === 30);
    verifier("chacune avec sa palette", lot.every(o => w.PALETTES_TENUES.includes(o.variationTenue.palette)));

    const w2 = charger();
    const mixte = [armure("Armure lourde", 1), { uid: "e", nom: "Épée courte", emplacement: "Main", type: "Arme lourde CAC" },
                   armure("Armure intermédiaire", 2), armure("Armure lourde", 3, { variationTenue: { titre: "Déjà", description: "x", palette: "y" } })];
    w2.tirerVariationsTenues(mixte, graine(3));
    verifier("une arme n'en reçoit pas", !mixte[1].variationTenue);
    verifier("chaque armure prend dans la liste de SON type",
             w2.VARIATIONS_TENUES["Armure lourde"].some(v => v.titre === mixte[0].variationTenue.titre)
             && w2.VARIATIONS_TENUES["Armure intermédiaire"].some(v => v.titre === mixte[2].variationTenue.titre));
    verifier("une tenue déjà tirée n'est pas retirée", mixte[3].variationTenue.titre === "Déjà");

    const w3 = charger();
    const a = Array.from({ length: 5 }, (_, i) => armure("Armure lourde", i));
    const b = Array.from({ length: 5 }, (_, i) => armure("Armure lourde", 10 + i));
    w3.tirerVariationsTenues(a, graine(11));
    w3.tirerVariationsTenues(b, graine(11));    // même hasard : seule la mémoire les sépare
    const ta = new Set(a.map(o => o.variationTenue.titre));
    verifier("deux lots de suite ne se répètent pas (mémoire de l'appareil)", b.every(o => !ta.has(o.variationTenue.titre)));

    const w4 = charger();
    const vues = new Set();
    for (let i = 0; i < 40; i++) {
        const l = Array.from({ length: 3 }, (_, k) => armure("Armure intermédiaire", i * 3 + k));
        w4.tirerVariationsTenues(l, graine(100 + i));
        l.forEach(o => vues.add(o.variationTenue.titre));
    }
    verifier("120 armures tirées : presque toute la liste y passe", vues.size >= 30, `${vues.size} tenues différentes`);

    const casse = { getItem: () => { throw new Error("bloqué"); }, setItem: () => { throw new Error("bloqué"); } };
    const w5 = charger(casse);
    const l5 = [armure("Armure légère", 1), armure("Armure légère", 2)];
    w5.tirerVariationsTenues(l5);
    verifier("sans stockage local, le tirage marche quand même", !!l5[0].variationTenue && l5[0].variationTenue.titre !== l5[1].variationTenue.titre);
    verifier("la phrase envoyée aux IA : titre, description, couleurs",
             /—/.test(w5.texteVariationTenue(l5[0].variationTenue)) && /Couleurs dominantes/.test(w5.texteVariationTenue(l5[0].variationTenue)));
}

// =========================================================================
console.log("\n3. CE QUI PART AUX DEUX IA (objets_ia.js)");
// =========================================================================
{
    const src = fs.readFileSync(`${RACINE}/objets_ia.js`, 'utf-8').replace(/^import[\s\S]*?;$/gm, '');
    const w = charger();
    const corps = [];
    const fauxFetch = async (url, options) => { corps.push(JSON.parse(options.body)); return { json: async () => ({ candidates: [] }) }; };
    const stockage = { getItem: (k) => (k === "ivalis_GEMINI_API_KEY" ? "cle" : null), setItem: () => {} };
    new Function('window', 'localStorage', 'fetch', 'db', 'doc', 'getDoc', 'updateDoc', 'console', src)
        (w, stockage, fauxFetch, {}, () => ({}), async () => ({ exists: () => false }), async () => {}, { log() {}, warn() {}, error() {} });

    const commune = armure("Armure lourde", 1);
    const rare = armure("Armure lourde", 2, { rarete: "Rare" });
    w.tirerVariationsTenues([commune, rare], graine(5));
    const p1 = w.promptImageObjet(commune, "Une cuirasse.", "STYLE");
    verifier("le dessinateur reçoit la tenue tirée (titre et couleurs)",
             p1.includes("DIRECTION ARTISTIQUE") && p1.includes(commune.variationTenue.titre) && p1.includes(commune.variationTenue.palette));
    verifier("une armure grise : simple mais propre, jamais déchirée", /QUALITÉ COMMUNE/.test(p1) && /jamais déchirée, rapiécée/.test(p1));
    const p2 = w.promptImageObjet(rare, "", "STYLE");
    verifier("une armure rare : pas de consigne de qualité commune", !/QUALITÉ COMMUNE/.test(p2) && p2.includes(rare.variationTenue.titre));
    const p3 = w.promptImageObjet({ nom: "Dague", emplacement: "Main", rarete: "Commun" }, "", "STYLE");
    verifier("une arme : ni tenue, ni consigne d'habit", !/DIRECTION ARTISTIQUE/.test(p3) && !/QUALITÉ COMMUNE/.test(p3));
    verifier("la tenue part même sans description de MIA", p2.includes("DIRECTION ARTISTIQUE"));

    await w.decrireObjetsAvecMIA([commune, { uid: "d", nom: "Dague", emplacement: "Main", rarete: "Commun" }]);
    const envoye = corps[0] || {};
    const fiches = JSON.parse(envoye.contents[0].parts[0].text);
    verifier("MIA reçoit la tenue imposée de l'armure, pas de l'arme",
             fiches[0].variation_imposee && fiches[0].variation_imposee.includes(commune.variationTenue.titre) && !fiches[1].variation_imposee);
    const systeme = envoye.systemInstruction.parts[0].text;
    verifier("MIA sait qu'elle doit suivre la variation", /variation_imposee/.test(systeme) && /suis-la fidèlement/.test(systeme));
    verifier("et qu'une armure commune n'est pas une guenille", /N'EST PAS UNE GUENILLE/.test(systeme) && !/simple, usé, sans fioriture/.test(systeme));

    const i = src.indexOf("window.illustrerLesObjets = async function");
    const corpsIllu = src.slice(i, src.indexOf("};", i));
    verifier("le tirage se fait avant la description, dans illustrerLesObjets",
             corpsIllu.indexOf("tirerVariationsTenues(objets") > 0
             && corpsIllu.indexOf("tirerVariationsTenues(objets") < corpsIllu.indexOf("decrireObjetsAvecMIA"));
    const html = fs.readFileSync(`${RACINE}/index.html`, 'utf-8');
    verifier("la page charge les variations avant objets_ia.js",
             html.indexOf('src="variations_tenues.js') > 0 && html.indexOf('src="variations_tenues.js') < html.indexOf('src="objets_ia.js'));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
