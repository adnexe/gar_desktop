import { ref } from 'vue';

// Fait "compter" un nombre de sa valeur actuelle jusqu'à `cible` en douceur
// (utilisé pour les totaux de fin de caisse) — purement visuel, la vraie
// valeur (celle imprimée) ne dépend jamais de cette animation.
export function useCompteurAnime() {
    const valeur = ref(0);
    let frame: number | null = null;

    function animerVers(cible: number, dureeMs = 500) {
        if (frame !== null) cancelAnimationFrame(frame);

        const depart = valeur.value;
        const debut = performance.now();

        function etape(maintenant: number) {
            const t = Math.min(1, (maintenant - debut) / dureeMs);
            // Ease-out : rapide au départ, ralentit en approchant la cible.
            const progression = 1 - (1 - t) * (1 - t);
            valeur.value = Math.round(depart + (cible - depart) * progression);

            if (t < 1) {
                frame = requestAnimationFrame(etape);
            } else {
                valeur.value = cible;
                frame = null;
            }
        }

        frame = requestAnimationFrame(etape);
    }

    return { valeur, animerVers };
}
