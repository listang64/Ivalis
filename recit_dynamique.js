// =========================================================================
//  IVALIS - RÉCIT DYNAMIQUE (Visual Novel Mode)
// =========================================================================

let paragraphesRecit = [];
let indexParagraphe = 0;
let isTyping = false;
let skipTyping = false;
let typingSpans = [];
let typingIndex = 0;
let currentTimer = null;
// LA FIN DU PARCHEMIN PEUT ATTENDRE (v278, combat_rp.js) : le verdict de
// MIA_COMBAT (« Le destin hésite… »), puis le bouton COMBATTRE. Tant qu'elle
// est là, un toucher sur le parchemin ne fait rien.
let optionsRecit = {};
let finRecitEnCours = false;
// LE RÉCIT QUI S'ÉCRIT ENCORE (v291) : le parchemin s'ouvre dès le premier
// paragraphe du MJ. `enCours` : d'autres paragraphes arrivent ;
// `pnjAttendus` : les nouveaux venus du récit (null tant qu'on les cherche) ;
// `pnjPrets` : tous les portraits sont là (ou ne viendront pas). Quand un
// nouveau venu prend la parole avant son portrait, son nom s'affiche et le
// parchemin attend (un toucher passe l'attente, et elle a une limite).
let etatRecit = { enCours: false, pnjAttendus: null, pnjPrets: true };
let attenteRecit = null;
let attentesPassees = {};
const DELAI_ATTENTE_RECIT = { ecriture: 120000, noms: 15000, portrait: 45000 };

// 1. Initialisation de l'interface graphique (Créée dynamiquement)
function initInterfaceRecit() {
    if (document.getElementById("ecran-recit-dynamique")) return;

    const overlay = document.createElement("div");
    overlay.id = "ecran-recit-dynamique";
    overlay.style.cssText = `
        display: none; position: fixed; top: 0; left: 0; width: 100vw; height: var(--app-h);
        background-image: url('./images/Fond_Parchemin.png'); background-size: 100% 100%; background-position: center;
        z-index: 9000; opacity: 0; transition: opacity 1.5s ease-in-out; cursor: pointer;
    `;

    const nomContainer = document.createElement("div");
    nomContainer.id = "nom-recit-dynamique";
    nomContainer.style.cssText = `
        position: absolute; top: 8vh; left: 50%; transform: translateX(-50%);
        font-family: 'Cinzel', serif; font-size: 140px; font-weight: bold; color: #4a2511;
        text-shadow: 5px 15px 15px rgba(0,0,0,0.8), 0px 0px 25px rgba(194, 168, 120, 0.4);
        opacity: 0; transition: opacity 0.8s ease-in-out;
        border-bottom: 3px solid rgba(194, 168, 120, 0.5); padding-bottom: 5px; width: max-content;
        display: none; z-index: 10;
    `;

    const texteContainer = document.createElement("div");
    texteContainer.id = "texte-recit-dynamique";
    texteContainer.style.cssText = `
        position: absolute; top: 55%; transform: translate(-50%, -50%);
        display: flex; flex-direction: column; gap: 15px;
        color: #1a0f08; font-family: 'Almendra', serif; font-size: 2.2vw; line-height: 1.6;
        text-shadow: 0px 0px 1px rgba(0,0,0,0.3); transition: opacity 0.4s ease-in-out;
    `;

    const contenuTexte = document.createElement("div");
    contenuTexte.id = "contenu-texte-recit";

    const portrait = document.createElement("img");
    portrait.id = "portrait-recit-dynamique";
    portrait.style.cssText = `
        position: absolute; bottom: 0; right: 0; height: 95vh; width: 35vw; object-fit: contain; object-position: right bottom;
        opacity: 0; transition: opacity 0.8s ease-in-out; filter: drop-shadow(-10px 10px 20px rgba(0,0,0,0.8));
        pointer-events: none;
    `;

    const attente = document.createElement("div");
    attente.id = "attente-recit-dynamique";
    attente.className = "attente-recit";

    overlay.appendChild(nomContainer);
    overlay.appendChild(attente);
    texteContainer.appendChild(contenuTexte);
    overlay.appendChild(texteContainer);
    overlay.appendChild(portrait);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", gererClicRecit);
}

// 2. Point d'entrée : Lancement de la scène
// `options.ts` : l'horodatage du message du MJ (c'est lui que juge MIA_COMBAT).
// `options.enCours`, `options.pnjAttendus`, `options.pnjPrets` (v291) : l'état
// du message du MJ quand il arrive (voir etatRecit).
const decouperRecit = (texteHtml) => String(texteHtml || "").split(/<br\s*\/?>/i).filter(p => p.trim() !== "");
const lireEtatRecit = (o) => ({
    enCours: !!(o && o.enCours),
    pnjAttendus: o && Array.isArray(o.pnjAttendus) ? o.pnjAttendus : null,
    pnjPrets: !(o && o.pnjPrets === false)
});
window.lancerRecitDynamique = function(texteHtml, options) {
    initInterfaceRecit();
    finirAttenteRecit();
    optionsRecit = options || {};
    etatRecit = lireEtatRecit(optionsRecit);
    attentesPassees = {};
    finRecitEnCours = false;
    paragraphesRecit = decouperRecit(texteHtml);
    indexParagraphe = 0;

    const overlay = document.getElementById("ecran-recit-dynamique");
    overlay.style.display = "block";
    
    setTimeout(() => {
        overlay.style.opacity = "1";
        setTimeout(jouerParagrapheCourant, 1000); 
    }, 50);
};

// LE MESSAGE DU MJ A CHANGÉ (v291) : un paragraphe de plus, un portrait posé,
// la liste des nouveaux venus. Les paragraphes déjà lus ne bougent pas ; une
// attente en cours se réévalue.
window.majRecitDynamique = function(ts, texteHtml, options) {
    const overlay = document.getElementById("ecran-recit-dynamique");
    if (!overlay || overlay.style.display === "none" || Number(ts) !== Number(optionsRecit.ts)) return;
    paragraphesRecit = decouperRecit(texteHtml);
    etatRecit = lireEtatRecit(options);
    if (attenteRecit) {
        const reprendre = attenteRecit.reprendre;
        finirAttenteRecit();
        reprendre();
    }
};

const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nomDans = (nom, texte) => {
    const n = sansAccent(nom).trim();
    if (!n) return false;
    return new RegExp("(^|[^a-z0-9])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(sansAccent(texte));
};

// Ce paragraphe doit-il attendre un portrait ? Seulement un dialogue, et
// seulement tant que les portraits du récit ne sont pas tous là.
function portraitAttenduRecit(html) {
    if (etatRecit.pnjPrets) return null;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const texte = tmp.textContent || "";
    if (!/["«»]/.test(texte)) return null;
    const avecPortrait = Array.from(tmp.querySelectorAll("span.pnj-chat-hover strong")).map(st => sansAccent(st.textContent).trim());
    if (Array.isArray(etatRecit.pnjAttendus)) {
        const nom = etatRecit.pnjAttendus.find(n => n && nomDans(n, texte) && !avecPortrait.includes(sansAccent(n).trim()));
        return nom ? { type: "portrait", nom } : null;
    }
    // Les nouveaux venus ne sont pas encore connus : un dialogue sans
    // portrait, qui n'est pas celui d'un héros, attend leur liste.
    if (tmp.querySelector("img.pnj-hover-img")) return null;
    const heros = (window.PERSOS_PARTIE || []).map(p => p && p.prenom).filter(Boolean);
    if (heros.some(h => nomDans(h, texte))) return null;
    return { type: "noms", nom: "" };
}

// L'ATTENTE : le nom de celui qui va parler (s'il est connu) et une ligne à
// la plume. Elle se montre après un court instant (pas de clignotement pour
// une attente brève).
function attendreRecit(type, nom, reprendre) {
    finirAttenteRecit();
    const index = indexParagraphe;
    const nomContainer = document.getElementById("nom-recit-dynamique");
    const bandeau = document.getElementById("attente-recit-dynamique");
    const imgElement = document.getElementById("portrait-recit-dynamique");
    attenteRecit = { type, nom, index, reprendre };
    attenteRecit.montrer = setTimeout(() => {
        if (!attenteRecit) return;
        if (bandeau) {
            bandeau.textContent = type === "portrait" ? "Le portrait se dessine…" : type === "noms" ? "La plume hésite…" : "Le Maître du Jeu écrit…";
            bandeau.classList.add("visible");
        }
        if (nom && nomContainer) {
            if (imgElement) imgElement.style.opacity = "0";
            nomContainer.innerHTML = nom;
            nomContainer.style.display = "block";
            setTimeout(() => { nomContainer.style.opacity = "1"; }, 50);
        }
    }, 500);
    attenteRecit.limite = setTimeout(() => passerAttenteRecit(), DELAI_ATTENTE_RECIT[type] || 30000);
}

function finirAttenteRecit() {
    if (!attenteRecit) return;
    clearTimeout(attenteRecit.montrer);
    clearTimeout(attenteRecit.limite);
    attenteRecit = null;
    const bandeau = document.getElementById("attente-recit-dynamique");
    if (bandeau) bandeau.classList.remove("visible");
}

// L'attente est passée (limite atteinte, ou un toucher) : la réplique
// s'écrit sans portrait ; la fin d'un récit qui ne vient plus se referme.
function passerAttenteRecit() {
    if (!attenteRecit) return;
    const { type, index, reprendre } = attenteRecit;
    finirAttenteRecit();
    if (type === "ecriture") etatRecit.enCours = false;
    else attentesPassees[index] = true;
    reprendre();
}

// 3. Jouer un paragraphe
function jouerParagrapheCourant() {
    if (indexParagraphe >= paragraphesRecit.length) {
        if (etatRecit.enCours) { attendreRecit("ecriture", "", jouerParagrapheCourant); return; }
        terminerRecit();
        return;
    }

    let texteBrut = paragraphesRecit[indexParagraphe];
    const besoin = attentesPassees[indexParagraphe] ? null : portraitAttenduRecit(texteBrut);
    if (besoin) { attendreRecit(besoin.type, besoin.nom, jouerParagrapheCourant); return; }
    let imageUrl = null;
    let nomPnjActif = "";

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = texteBrut;

    const imgNode = tempDiv.querySelector("img.pnj-hover-img");
    const isDialogue = /["«»]/.test(tempDiv.textContent); 

    if (imgNode && isDialogue) {
        // CORRECTION : On utilise getAttribute pour être certain de la correspondance parfaite du texte de l'URL
        imageUrl = imgNode.getAttribute("src");
        const parentSpan = imgNode.closest("span.pnj-chat-hover");
        if (parentSpan) {
            const strongNode = parentSpan.querySelector("strong");
            if (strongNode) nomPnjActif = strongNode.textContent.trim();
        }
    }

    const pnjSpans = tempDiv.querySelectorAll("span.pnj-chat-hover");
    pnjSpans.forEach(span => {
        const strong = span.querySelector("strong");
        if (strong) span.parentNode.replaceChild(document.createTextNode(strong.textContent), span);
    });

    const strongs = tempDiv.querySelectorAll("strong[style]");
    strongs.forEach(st => st.parentNode.replaceChild(document.createTextNode(st.textContent), st));

    let texteAecrire = tempDiv.innerHTML;

    if (nomPnjActif !== "") {
        const regexSafeNom = nomPnjActif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPrefix = new RegExp('^\\s*' + regexSafeNom + '\\s*:\\s*', 'i');
        texteAecrire = texteAecrire.replace(regexPrefix, '');
    }

    texteAecrire = texteAecrire.replace(/(["«][^"»]+["»])/g, '<span style="font-style: italic; font-weight: bold;">$1</span>');

    const imgElement = document.getElementById("portrait-recit-dynamique");
    const texteContainer = document.getElementById("texte-recit-dynamique");
    const nomContainer = document.getElementById("nom-recit-dynamique");
    const contenuTexte = document.getElementById("contenu-texte-recit");
    
    contenuTexte.style.opacity = "0"; 
    let delaiAvantTyping = 0;

    if (imageUrl) {
        // CORRECTION : Comparaison stricte avec getAttribute
        if (imgElement.getAttribute("src") !== imageUrl || imgElement.style.opacity === "0") {
            imgElement.setAttribute("src", imageUrl);
            imgElement.style.opacity = "1";
            delaiAvantTyping = 800; 
        }
        
        texteContainer.style.left = "33%";
        texteContainer.style.width = "48vw";
        texteContainer.style.textAlign = "left";
        texteContainer.style.alignItems = "flex-start";

        nomContainer.innerHTML = nomPnjActif;
        nomContainer.style.display = "block";
        
        setTimeout(() => { nomContainer.style.opacity = "1"; }, 50);

    } else {
        imgElement.style.opacity = "0";
        nomContainer.style.opacity = "0";
        setTimeout(() => { nomContainer.style.display = "none"; }, 800); 

        texteContainer.style.left = "50%";
        texteContainer.style.width = "70vw";
        texteContainer.style.textAlign = "center";
        texteContainer.style.alignItems = "center"; 
        delaiAvantTyping = 50; 
    }

    setTimeout(() => {
        contenuTexte.innerHTML = texteAecrire;
        preparerTextePourTyping(contenuTexte);
        
        typingSpans = Array.from(contenuTexte.querySelectorAll(".lettre-typing"));
        typingIndex = 0;
        isTyping = true;
        skipTyping = false;

        contenuTexte.style.opacity = "1";
        lancerTypingEffet();
    }, delaiAvantTyping);
}

// 4. PRÉPARATION ANTI-BOUBOUGE
function preparerTextePourTyping(elementHTML) {
    function walk(node) {
        if (node.nodeType === 3) { 
            const text = node.nodeValue;
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < text.length; i++) {
                const span = document.createElement("span");
                span.textContent = text[i];
                span.style.opacity = "0"; 
                span.className = "lettre-typing";
                fragment.appendChild(span);
            }
            node.parentNode.replaceChild(fragment, node);
        } else if (node.nodeType === 1) { 
            if (node.tagName !== "IMG" && !node.classList.contains("lettre-typing")) {
                Array.from(node.childNodes).forEach(walk);
            }
        }
    }
    Array.from(elementHTML.childNodes).forEach(walk);
}

// 5. La Machine à écrire 
function lancerTypingEffet() {
    if (skipTyping) {
        typingSpans.forEach(span => span.style.opacity = "1");
        isTyping = false;
        return;
    }

    if (typingIndex < typingSpans.length) {
        typingSpans[typingIndex].style.opacity = "1";
        typingIndex++;
        currentTimer = setTimeout(lancerTypingEffet, 25); 
    } else {
        isTyping = false;
    }
}

// La dernière page lue : le combat du récit a peut-être son mot à dire.
function terminerRecit() {
    if (typeof window.finRecitCombat === "function") {
        try {
            if (window.finRecitCombat(optionsRecit.ts, { fermer: fermerRecitDynamique })) { finRecitEnCours = true; return; }
        } catch (e) { console.error("Fin du parchemin (combat) :", e); }
    }
    fermerRecitDynamique();
}

// 6. Gestionnaire de clic (CORRECTION DU FONDU DE TRANSITION)
function gererClicRecit() {
    if (finRecitEnCours) return;
    if (attenteRecit) { if (attenteRecit.type !== "ecriture") passerAttenteRecit(); return; }
    if (isTyping) {
        skipTyping = true;
        clearTimeout(currentTimer);
        lancerTypingEffet(); 
    } else {
        const contenuTexte = document.getElementById("contenu-texte-recit");
        const nomContainer = document.getElementById("nom-recit-dynamique");
        const imgElement = document.getElementById("portrait-recit-dynamique");
        
        contenuTexte.style.opacity = "0"; 
        let delaiTransition = 400; // Vitesse de passage par défaut (si c'est le même PNJ)
        
        // On anticipe le prochain paragraphe !
        if (indexParagraphe + 1 < paragraphesRecit.length) {
            let prochainTexte = paragraphesRecit[indexParagraphe + 1];
            
            const tempCheck = document.createElement("div");
            tempCheck.innerHTML = prochainTexte;
            const nextIsDialogue = /["«»]/.test(tempCheck.textContent);
            const nextImgNode = tempCheck.querySelector("img.pnj-hover-img");
            
            let nextImageUrl = (nextIsDialogue && nextImgNode) ? nextImgNode.getAttribute("src") : null;
            let currentImageUrl = imgElement.getAttribute("src");

            // Si c'est de la narration, OU un PNJ différent : on déclenche le fondu de l'image !
            if (!nextImageUrl || currentImageUrl !== nextImageUrl) {
                nomContainer.style.opacity = "0";
                
                if (imgElement.style.opacity !== "0") {
                    imgElement.style.opacity = "0"; // Fait disparaître l'ancien PNJ
                    delaiTransition = 800; // On laisse 800ms au CSS pour finir le fondu au noir avant de changer l'image
                }
            }
        }

        setTimeout(() => {
            indexParagraphe++;
            jouerParagrapheCourant();
        }, delaiTransition); 
    }
}

// 7. Fin de la scène
function fermerRecitDynamique() {
    finRecitEnCours = false;
    finirAttenteRecit();
    const overlay = document.getElementById("ecran-recit-dynamique");
    overlay.style.opacity = "0"; 
    setTimeout(() => {
        overlay.style.display = "none";
        document.getElementById("contenu-texte-recit").innerHTML = "";
        document.getElementById("nom-recit-dynamique").innerHTML = "";
        document.getElementById("portrait-recit-dynamique").removeAttribute("src"); // On nettoie proprement la source
    }, 1500);
}
window.fermerRecitDynamique = fermerRecitDynamique;
