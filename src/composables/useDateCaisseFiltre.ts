import { onBeforeUnmount, onMounted, ref } from 'vue';
import { dateCaisseDuJour } from '@/lib/dateCaisse';

export function useDateCaisseFiltre() {
    const aujourdhui = () => dateCaisseDuJour();
    const dateFiltre = ref(aujourdhui());
    let dernierJourConnu = dateFiltre.value;
    let intervalle: ReturnType<typeof setInterval> | null = null;

    function actualiserJourDeCaisse() {
        const nouveauJour = aujourdhui();
        if (nouveauJour === dernierJourConnu) return;

        const suivaitLeJourCourant = dateFiltre.value === dernierJourConnu;
        dernierJourConnu = nouveauJour;

        if (suivaitLeJourCourant) dateFiltre.value = nouveauJour;
    }

    function actualiserQuandVisible() {
        if (document.visibilityState === 'visible') actualiserJourDeCaisse();
    }

    onMounted(() => {
        intervalle = setInterval(actualiserJourDeCaisse, 30_000);
        window.addEventListener('focus', actualiserJourDeCaisse);
        document.addEventListener('visibilitychange', actualiserQuandVisible);
    });

    onBeforeUnmount(() => {
        if (intervalle) clearInterval(intervalle);
        window.removeEventListener('focus', actualiserJourDeCaisse);
        document.removeEventListener('visibilitychange', actualiserQuandVisible);
    });

    return { dateFiltre, aujourdhui, actualiserJourDeCaisse };
}
