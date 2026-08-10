class Plateau {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // 4. Dimensions fixées à 1800x1800
        this.canvas.width = 1800;
        this.canvas.height = 1800;

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
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
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
        const offsetX = this.canvas.width / 2;
        const offsetY = this.canvas.height / 2;
        
        return { x: x + offsetX, y: y + offsetY };
    }

    /**
     * Convertit un clic de souris (pixels) en case de la grille (q, r).
     * Indispensable pour le drag & drop, l'aimantation et les clics ciblés.
     */
    pixelToHex(x, y) {
        const offsetX = this.canvas.width / 2;
        const offsetY = this.canvas.height / 2;
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

    drawHex(x, y, state, isEditMode = false) {
        // Si supprimée et qu'on n'est pas en train d'éditer, on l'efface totalement
        if (state.isDeleted && !isEditMode) return;

        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle_rad = Math.PI / 180 * (60 * i);
            const hx = x + this.hexSize * Math.cos(angle_rad);
            const hy = y + this.hexSize * Math.sin(angle_rad);
            
            if (i === 0) this.ctx.moveTo(hx, hy);
            else this.ctx.lineTo(hx, hy);
        }
        this.ctx.closePath();

        // Rendu visuel dynamique
        if (state.isDeleted && isEditMode) {
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // Calque rouge fantôme
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        } else if (state.isTargeted) {
            this.ctx.fillStyle = 'rgba(255, 50, 50, 0.4)'; 
            this.ctx.fill();
            this.ctx.strokeStyle = `rgba(0, 0, 0, ${this.gridOpacity})`;
        } else if (state.isBlocked) {
            this.ctx.fillStyle = 'rgba(50, 50, 50, 0.8)'; 
            this.ctx.fill();
            this.ctx.strokeStyle = `rgba(0, 0, 0, ${this.gridOpacity})`;
        } else {
            this.ctx.strokeStyle = `rgba(0, 0, 0, ${this.gridOpacity})`;
        }

        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }

    renderMap(isEditMode = false) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const maxDist = Math.sqrt(Math.pow(this.canvas.width / 2, 2) + Math.pow(this.canvas.height / 2, 2));
        const mapRadius = Math.ceil(maxDist / this.hexSize);

        for (let q = -mapRadius; q <= mapRadius; q++) {
            for (let r = Math.max(-mapRadius, -q - mapRadius); r <= Math.min(mapRadius, -q + mapRadius); r++) {
                const { x, y } = this.hexToPixel(q, r);
                
                if (x >= -this.hexSize && x <= this.canvas.width + this.hexSize && 
                    y >= -this.hexSize && y <= this.canvas.height + this.hexSize) {
                    
                    const state = this.getCaseState(q, r);
                    this.drawHex(x, y, state, isEditMode);
                }
            }
        }
    }
}
