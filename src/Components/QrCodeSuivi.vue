<script setup lang="ts">
import QrcodeVue from 'qrcode.vue';

withDefaults(defineProps<{
    valeur?: string | null;
    compact?: boolean;
}>(), {
    valeur: null,
    compact: false,
});
</script>

<template>
    <div v-if="valeur" class="qr-suivi" :class="{ compact }">
        <QrcodeVue
            :value="valeur"
            :size="compact ? 84 : 96"
            level="M"
            render-as="svg"
            :margin="4"
        />
        <p>{{ compact ? 'Scanner pour vérifier' : 'Scannez pour voir les détails' }}</p>
    </div>
</template>

<style scoped>
.qr-suivi {
    box-sizing: border-box;
    break-inside: avoid;
    margin: 3px auto 2px;
    padding: 0.5mm;
    text-align: center;
    width: 28mm;
}

.qr-suivi.compact {
    width: 25mm;
}

.qr-suivi :deep(svg) {
    background: #fff;
    display: block;
    height: auto;
    margin: 0 auto;
    width: 100%;
}

.qr-suivi p {
    color: #000;
    font-family: Arial, 'Helvetica Neue', sans-serif;
    font-size: 8px;
    line-height: 1.15;
    margin: 1px 0 0;
    overflow-wrap: normal;
    word-break: normal;
}
</style>
