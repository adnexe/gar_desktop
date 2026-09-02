<script setup lang="ts">
import JsBarcode from 'jsbarcode';
import { nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps<{
    valeur: string;
    libelle?: string;
}>();

const svg = ref<SVGSVGElement | null>(null);
const erreur = ref(false);

function dessiner() {
    if (!svg.value || !props.valeur.trim()) return;

    try {
        JsBarcode(svg.value, props.valeur.trim(), {
            format: 'CODE128',
            displayValue: false,
            width: 1.3,
            height: 40,
            margin: 0,
            marginLeft: 13,
            marginRight: 13,
            background: '#ffffff',
            lineColor: '#000000',
        });
        erreur.value = false;
    } catch {
        // Le numéro reste écrit sous le code : une ancienne référence non
        // compatible ne doit jamais rendre le talon inutilisable.
        svg.value.replaceChildren();
        erreur.value = true;
    }
}

onMounted(dessiner);
watch(() => props.valeur, () => void nextTick(dessiner), { flush: 'post' });
</script>

<template>
    <figure class="code-barres" :class="{ 'code-barres-erreur': erreur }">
        <svg ref="svg" role="img" :aria-label="`${libelle ?? 'Code-barres'} ${valeur}`" />
        <figcaption>{{ valeur }}</figcaption>
    </figure>
</template>

<style scoped>
.code-barres {
    margin: 2.5mm 0 2mm;
    overflow: hidden;
    text-align: center;
    width: 100%;
}

.code-barres svg {
    display: block;
    height: auto;
    margin: 0 auto;
    max-width: 100%;
}

.code-barres figcaption {
    font-family: 'Courier New', monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.15;
    margin-top: 1mm;
    overflow-wrap: anywhere;
}

.code-barres-erreur svg {
    display: none;
}
</style>
