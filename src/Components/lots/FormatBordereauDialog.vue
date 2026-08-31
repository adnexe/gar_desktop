<script setup lang="ts">
import { FileText, Printer, ReceiptText } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/Components/ui/dialog';
import type { FormatBordereau } from '@/lib/impressionA4';

defineProps<{ open: boolean; format: FormatBordereau; largeurPos: number }>();
const emit = defineEmits<{
    'update:open': [value: boolean];
    'update:format': [value: FormatBordereau];
    confirmer: [];
}>();
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Format du bordereau</DialogTitle>
                <DialogDescription>Choisissez le papier de votre imprimante.</DialogDescription>
            </DialogHeader>
            <fieldset class="grid grid-cols-2 gap-3">
                <legend class="sr-only">Format d’impression</legend>
                <label :class="['flex cursor-pointer items-center gap-3 rounded-md border p-4', format === 'a4' ? 'border-primary bg-muted' : 'border-input']">
                    <input type="radio" name="format-bordereau" value="a4" :checked="format === 'a4'" class="size-4 accent-current" @change="emit('update:format', 'a4')">
                    <span class="min-w-0"><FileText class="mb-2 size-5 text-sky-600" /><strong class="block">A4</strong><span class="text-sm text-muted-foreground">210 × 297 mm</span></span>
                </label>
                <label :class="['flex cursor-pointer items-center gap-3 rounded-md border p-4', format === 'pos' ? 'border-primary bg-muted' : 'border-input']">
                    <input type="radio" name="format-bordereau" value="pos" :checked="format === 'pos'" class="size-4 accent-current" @change="emit('update:format', 'pos')">
                    <span class="min-w-0"><ReceiptText class="mb-2 size-5 text-emerald-600" /><strong class="block">POS</strong><span class="text-sm text-muted-foreground">Rouleau {{ largeurPos }} mm</span></span>
                </label>
            </fieldset>
            <DialogFooter>
                <Button variant="outline" @click="emit('update:open', false)">Annuler</Button>
                <Button @click="emit('confirmer')"><Printer class="size-4" /> Continuer</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
