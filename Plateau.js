class Plateau {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // 4. Dimensions fixées à 1800x1800
        this.largeurLogique = 1800;
        this.hauteurLogique = 1800;
        this.ratioRendu = 1;
        this.resize(1800, 1800);

        // 2. Taille de l'hexagone (rayon). 
        // À ajuster selon la taille de tes images de personnages vus de haut.
        // Avec hexSize = 60, un token de 100x100 pixels rentrera parfaitement au centre.
        this.hexSize = 60; 

        // 1. Mathématiques pour l'orientation "Bord plat en haut" (Flat-topped)
        this.hexWidth = 2 * this.hexSize;
        this.hexHeight = Math.sqrt(3) * this.hexSize;

        // 3. Base de données locale de la grille
        // Structure clé-valeur (ex: "0,-1") idéale pour sauvegarder/charger depuis une BDD
        this.gridState = {};

        // NOUVEAU : Transparence de la grille par défaut
        this.gridOpacity = 0.8;
    }

    // ==========================================
    // SYSTÈME DE COORDONNÉES ET AIMANTATION
    // ==========================================

    /**
     * NOUVEAU : Adapte la résolution du canvas à l'image chargée en fond
     * Le canvas garde sa taille logique en CSS, mais dessine sur une surface plus dense
     * pour que la grille reste nette quand le plateau est zoomé.
     */
    resize(width, height) {
        this.largeurLogique = width;
        this.hauteurLogique = height;
        this.ratioRendu = this.calculerRatioRendu(width, height);

        this.canvas.width = Math.round(width * this.ratioRendu);
        this.canvas.height = Math.round(height * this.ratioRendu);
        this.canvas.style.width = width + "px";
        this.canvas.style.height = height + "px";
    }

    /**
     * Safari iOS abandonne le rendu des canvas trop volumineux : on plafonne la surface.
     */
    calculerRatioRendu(width, height) {
        // Plafond volontairement prudent : un canvas trop lourd fait décrocher le compositeur iOS
        const surfaceMax = 6000000;
        const ratioEcran = Math.min(window.devicePixelRatio || 1, 1.75);
        const ratioSurface = Math.sqrt(surfaceMax / Math.max(width * height, 1));
        return Math.max(1, Math.min(ratioEcran, ratioSurface));
    }

    /**
     * Convertit les coordonnées de la grille (q, r) en pixels (x, y) pour l'affichage.
     * C'est ici que tes tokens viendront s'aimanter (au centre exact de l'hexagone).
     */
    hexToPixel(q, r) {
        // Formules pour les hexagones à bords plats
        const x = this.hexSize * (3/2 * q);
        const y = this.hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        
        // Offset pour centrer le point 0,0 au milieu du canvas 1800x1800
        const offsetX = this.largeurLogique / 2;
        const offsetY = this.hauteurLogique / 2;
        
        return { x: x + offsetX, y: y + offsetY };
    }

    /**
     * Convertit un clic de souris (pixels) en case de la grille (q, r).
     * Indispensable pour le drag & drop, l'aimantation et les clics ciblés.
     */
    pixelToHex(x, y) {
        const offsetX = this.largeurLogique / 2;
        const offsetY = this.hauteurLogique / 2;
        const ptX = x - offsetX;
        const ptY = y - offsetY;

        // Conversion inversée pour les bords plats
        const q = (2/3 * ptX) / this.hexSize;
        const r = (-1/3 * ptX + Math.sqrt(3)/3 * ptY) / this.hexSize;

        return this.axialRound(q, r);
    }

    /**
     * Arrondi mathématique pour trouver le centre de la case la plus proche.
     * C'est le "moteur" de l'aimantation.
     */
    axialRound(q, r) {
        const s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);

        const qDiff = Math.abs(rq - q);
        const rDiff = Math.abs(rr - r);
        const sDiff = Math.abs(rs - s);

        if (qDiff > rDiff && qDiff > sDiff) {
            rq = -rr - rs;
        } else if (rDiff > sDiff) {
            rr = -rq - rs;
        }
        return { q: rq, r: rr };
    }

    // ==========================================
    // GESTION DES ZONES ET DONNÉES (BDD)
    // ==========================================

    /**
     * Met à jour l'état d'une case. 
     * Prêt à être couplé avec une requête BDD pour synchroniser tous les joueurs.
     */
    setCaseState(q, r, stateData) {
        const key = `${q},${r}`;
        this.gridState[key] = { ...this.gridState[key], ...stateData };
    }

    getCaseState(q, r) {
        return this.gridState[`${q},${r}`] || {};
    }

    /**
     * Calcule une zone d'effet (AoE) pour une attaque ou un sort.
     * Retourne la liste de toutes les cases comprises dans le rayon donné.
     */
    getHexesInRadius(centerQ, centerR, radius) {
        const hexes = [];
        for (let q = -radius; q <= radius; q++) {
            for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
                hexes.push({ q: centerQ + q, r: centerR + r });
            }
        }
        return hexes;
    }

    // ==========================================
    // MOTEUR DE RENDU
    // ==========================================

    drawHex(x, y, state) {
        // On vérifie quels outils le Maître du Jeu est en train d'utiliser
        const isGommeMode = window.VTT_MODE_EFFACEMENT === true;
        const isMursMode = window.VTT_MODE_MURS === true;
        const isDifficileMode = window.VTT_MODE_DIFFICILE === true;

        // 1. GOMME : Si supprimée et qu'on n'a pas l'outil gomme, on l'efface totalement (invisible)
        if (state.isDeleted && !isGommeMode) return;

        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle_rad = Math.PI / 180 * (60 * i);
            const hx = x + this.hexSize * Math.cos(angle_rad);
            const hy = y + this.hexSize * Math.sin(angle_rad);
            
            if (i === 0) this.ctx.moveTo(hx, hy);
            else this.ctx.lineTo(hx, hy);
        }
        this.ctx.closePath();

        // 2. RENDU VISUEL
        if (state.isDeleted && isGommeMode) {
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; 
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        } else if (state.isTargeted) {
            this.ctx.fillStyle = 'rgba(255, 50, 50, 0.4)'; 
            this.ctx.fill();
            this.ctx.strokeStyle = `rgba(0, 0, 0, ${this.gridOpacity})`;
        } else if (state.isBlocked && isMursMode) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; 
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; 
        } else if (state.isDifficult && isDifficileMode) {
            // NOUVEAU : Violet translucide avec contour blanc pour le terrain difficile (visible uniquement outil en main)
            this.ctx.fillStyle = 'rgba(155, 89, 182, 0.5)'; 
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        } else {
            // Cas standard
            this.ctx.strokeStyle = `rgba(0, 0, 0, ${this.gridOpacity})`;
        }

        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }

    renderMap() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.setTransform(this.ratioRendu, 0, 0, this.ratioRendu, 0, 0);

        const maxDist = Math.sqrt(Math.pow(this.largeurLogique / 2, 2) + Math.pow(this.hauteurLogique / 2, 2));
        const mapRadius = Math.ceil(maxDist / this.hexSize);

        for (let q = -mapRadius; q <= mapRadius; q++) {
            for (let r = Math.max(-mapRadius, -q - mapRadius); r <= Math.min(mapRadius, -q + mapRadius); r++) {
                const { x, y } = this.hexToPixel(q, r);
                
                if (x >= -this.hexSize && x <= this.largeurLogique + this.hexSize && 
                    y >= -this.hexSize && y <= this.hauteurLogique + this.hexSize) {
                    
                    const state = this.getCaseState(q, r);
                    this.drawHex(x, y, state); 
                }
            }
        }
    }
}
