<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

defineOptions({
    inheritAttrs: false,
});

type Props = {
    className?: HTMLAttributes['class'];
};

defineProps<Props>();
</script>

<template>
    <!-- Logo Adenexe Transport : bus stylisé (monochrome, suit currentColor) -->
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :class="className"
        v-bind="$attrs"
    >
        <rect x="5" y="2.5" width="14" height="13.5" rx="2.5" />
        <path d="M8 6.5h8" />
        <path d="M8 12.5h.01" />
        <path d="M16 12.5h.01" />
        <circle cx="8.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
        <path d="M3 21h3.5M10.25 21h3.5M17.5 21H21" />
    </svg>
</template>
