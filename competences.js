// =========================================================================
//  IVALIS - MODULE DES COMPÉTENCES DE COMBAT
// =========================================================================
import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

window.chargerOngletCompetences = async function(idPersonnage, competencesMax = 6) {
    const spanMax = document.getElementById("affichage-competences-max");
    const spanRestantes = document.getElementById("affichage-competences-restantes");
    const btnCreer = document.getElementById("btn-creer-competence");
    const listeDiv = document.getElementById("liste-competences-perso");

    if (spanMax) spanMax.innerText = competencesMax;

    try {
        const colRef = collection(db, "Personnages", idPersonnage, "Competences");
        const snap = await getDocs(colRef);

        const nbCreees = snap.size;
        const nbRestantes = competencesMax - nbCreees;

        if (spanRestantes) {
            spanRestantes.innerText = Math.max(0, nbRestantes);
            spanRestantes.style.color = nbRestantes > 0 ? "#1b6e3a" : "#ff4c4c";
        }

        if (btnCreer) {
            if (nbRestantes > 0) {
                btnCreer.disabled = false;
                btnCreer.style.opacity = "1";
                btnCreer.style.filter = "none";
                btnCreer.style.cursor = "pointer";
            } else {
                btnCreer.disabled = true;
                btnCreer.style.opacity = "0.4";
                btnCreer.style.filter = "grayscale(100%)";
                btnCreer.style.cursor = "not-allowed";
            }
        }

        listeDiv.innerHTML = "";
        if (nbCreees === 0) {
            listeDiv.innerHTML = `<p style="text-align: center; font-style: italic; color: #5c3a21; margin-top: 20px;">Le héros n'a pas encore forgé ses techniques de combat.</p>`;
        } else {
            snap.forEach(docSnap => {
                const data = docSnap.data();
                listeDiv.innerHTML += `
                    <div style="background: rgba(255,255,255,0.6); padding: 12px; border-radius: 6px; border: 1px solid #c2a878;">
                        <strong style="color: #2a1a0f;">${data.Nom || "Technique Inconnue"}</strong>
                    </div>`;
            });
        }
    } catch (e) {
        console.error("Erreur de lecture des compétences :", e);
    }
};

window.ouvrirCreationCompetence = function() {
    console.log("🛠️ Préparation de la forge de compétence...");
    alert("L'interface de création est prête à être développée à la prochaine étape !");
};
