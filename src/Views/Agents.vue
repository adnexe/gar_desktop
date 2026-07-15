<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RefreshCw, ShieldOff, Trash2, UserCog, UserRoundCheck } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';

interface AgentLocal {
    id: number;
    uuid: string;
    nom: string;
    telephone: string | null;
    role: string;
    type_agent: string[];
    actif: boolean;
    desactive_localement: boolean;
    user_id: number | null;
    user_uuid: string | null;
    user_email: string | null;
    user_number: string | null;
    user_actif: boolean | null;
    user_desactive_localement: boolean | null;
}

const config = useConfigStore();
const session = useSessionStore();

const agents = ref<AgentLocal[]>([]);
const chargement = ref(false);
const actualisation = ref(false);
const actionEnCours = ref<string | null>(null);
const message = ref('');
const avertissement = ref('');
const erreur = ref('');

const peutSupprimer = computed(() => session.role === 'super_admin');

function messageErreur(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    const messageNettoye = e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');

    const messages: Record<string, string> = {
        ACTION_NON_AUTORISEE: "Vous n'avez pas le droit de gérer les agents sur ce poste.",
        SUPPRESSION_RESERVEE_SUPER_ADMIN: 'La suppression locale est réservée au super admin.',
        ACTION_SUR_SOI_INTERDITE: 'Vous ne pouvez pas couper votre propre compte.',
        AGENT_HORS_AGENCE: "Cet agent n'appartient pas à votre gare.",
        AGENT_INTROUVABLE: 'Agent introuvable localement.',
        ACCES_INTROUVABLE: "Cet agent n'a pas d'accès local à supprimer ou désactiver.",
    };

    return messages[messageNettoye] ?? messageNettoye ?? defaut;
}

function compteActif(agent: AgentLocal) {
    return !!agent.user_id && agent.actif && agent.user_actif !== false && !agent.user_desactive_localement;
}

function libelleRole(role: string) {
    if (role === 'chef_gare') return 'Chef de gare';
    if (role === 'caissiere' || role === 'agent') return 'Agent';

    return role;
}

function libelleModule(module: string) {
    if (module === 'ticket') return 'Ticket';
    if (module === 'bagage') return 'Bagage';
    if (module === 'courrier') return 'Courrier';

    return module;
}

function statutAgent(agent: AgentLocal) {
    if (!agent.user_id) return 'Sans accès';
    if (agent.user_desactive_localement) return 'Accès coupé localement';
    if (!agent.actif) return 'Agent désactivé';
    if (agent.user_actif === false) return 'Accès désactivé';

    return 'Actif';
}

function classeStatut(agent: AgentLocal) {
    if (compteActif(agent)) return 'border-transparent bg-emerald-100 text-emerald-700';
    if (agent.user_desactive_localement) return 'border-transparent bg-amber-100 text-amber-700';

    return 'border-transparent bg-muted text-muted-foreground';
}

async function charger() {
    if (!config.agence) {
        await config.charger();
    }

    if (!config.agence) {
        agents.value = [];
        erreur.value = 'Agence non configurée sur ce poste.';
        return;
    }

    chargement.value = true;
    erreur.value = '';

    try {
        agents.value = await window.api.agents.lister(config.agence.id);
    } catch (e) {
        agents.value = [];
        erreur.value = messageErreur(e, 'Impossible de charger les agents locaux.');
    } finally {
        chargement.value = false;
    }
}

async function actualiser() {
    actualisation.value = true;
    message.value = '';
    avertissement.value = '';
    erreur.value = '';

    try {
        const resultat = await window.api.config.actualiser();
        await config.charger();
        message.value = resultat.ok
            ? 'Agents actualisés depuis admin.'
            : (resultat.erreur ?? 'Admin injoignable, agents locaux affichés.');
    } catch (e) {
        avertissement.value = messageErreur(e, 'Admin injoignable, agents locaux affichés.');
    } finally {
        await charger();
        actualisation.value = false;
    }
}

async function executer(agent: AgentLocal, action: 'desactiver' | 'reactiver' | 'supprimer') {
    if (!session.userId) return;
    if (agent.user_id === session.userId) {
        erreur.value = 'Vous ne pouvez pas couper votre propre compte.';
        return;
    }

    if (action === 'supprimer' && !window.confirm(`Supprimer localement l'accès de ${agent.nom} ? L'agent restera dans l'historique des ventes.`)) {
        return;
    }

    actionEnCours.value = `${action}:${agent.uuid}`;
    message.value = '';
    avertissement.value = '';
    erreur.value = '';

    try {
        if (action === 'desactiver') {
            await window.api.agents.desactiver(agent.uuid, session.userId);
            message.value = "Accès désactivé localement. La modification sera envoyée à admin dès que possible.";
        } else if (action === 'reactiver') {
            await window.api.agents.reactiver(agent.uuid, session.userId);
            message.value = "Désactivation locale de l'accès retirée.";
        } else {
            await window.api.agents.supprimerLocalement(agent.uuid, session.userId);
            message.value = "Accès supprimé localement. L'agent reste lié aux ventes et la coupure sera synchronisée vers admin.";
        }

        await charger();
    } catch (e) {
        erreur.value = messageErreur(e, "L'action sur cet agent a échoué.");
    } finally {
        actionEnCours.value = null;
    }
}

onMounted(() => {
    void charger();
});
</script>

<template>
    <AppSidebarLayout titre="Agents">
        <div class="space-y-5">
            <section class="rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 class="flex items-center gap-2 text-xl font-semibold"><UserCog class="size-5" /> Agents</h1>
                        <p class="mt-1 text-[0.95rem] text-muted-foreground">Comptes locaux de la gare actuellement configurée.</p>
                    </div>

                    <Button type="button" variant="outline" :disabled="actualisation || chargement" @click="actualiser">
                        <RefreshCw :class="['size-4', (actualisation || chargement) ? 'animate-spin text-primary' : '']" />
                        {{ actualisation ? 'Actualisation...' : 'Actualiser' }}
                    </Button>
                </div>
            </section>

            <p v-if="message" class="rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{{ message }}</p>
            <p v-if="avertissement" class="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">{{ avertissement }}</p>
            <p v-if="erreur" class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ erreur }}</p>

            <section class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <p v-if="chargement" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Chargement des agents...</p>
                <p v-else-if="agents.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun agent local pour cette gare.</p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Agent</th>
                            <th class="px-3 py-3 font-medium">Accès</th>
                            <th class="px-3 py-3 font-medium">Modules</th>
                            <th class="px-3 py-3 font-medium">Statut</th>
                            <th class="px-3 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="agent in agents" :key="agent.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">
                                <p class="font-semibold">{{ agent.nom }}</p>
                                <p class="text-xs text-muted-foreground">{{ libelleRole(agent.role) }} · {{ agent.telephone ?? 'Téléphone non défini' }}</p>
                            </td>
                            <td class="px-3 py-3">
                                <p>{{ agent.user_number ?? '—' }}</p>
                                <p class="text-xs text-muted-foreground">{{ agent.user_email ?? 'Email non défini' }}</p>
                            </td>
                            <td class="px-3 py-3">
                                <div class="flex flex-wrap gap-1.5">
                                    <Badge v-for="module in agent.type_agent" :key="module" variant="outline">
                                        {{ libelleModule(module) }}
                                    </Badge>
                                    <span v-if="agent.type_agent.length === 0" class="text-muted-foreground">—</span>
                                </div>
                            </td>
                            <td class="px-3 py-3">
                                <span :class="['inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold', classeStatut(agent)]">
                                    {{ statutAgent(agent) }}
                                </span>
                            </td>
                            <td class="px-3 py-3">
                                <div class="flex justify-end gap-2">
                                    <Button
                                        v-if="compteActif(agent)"
                                        size="sm"
                                        variant="outline"
                                        :disabled="agent.user_id === session.userId || actionEnCours !== null"
                                        @click="executer(agent, 'desactiver')"
                                    >
                                        <ShieldOff class="size-4" />
                                        Désactiver
                                    </Button>
                                    <Button
                                        v-else-if="agent.user_desactive_localement"
                                        size="sm"
                                        variant="outline"
                                        :disabled="agent.user_id === session.userId || actionEnCours !== null"
                                        @click="executer(agent, 'reactiver')"
                                    >
                                        <UserRoundCheck class="size-4" />
                                        Réactiver local
                                    </Button>
                                    <Button
                                        v-if="peutSupprimer && agent.user_id"
                                        size="sm"
                                        variant="outline"
                                        :disabled="agent.user_id === session.userId || actionEnCours !== null"
                                        @click="executer(agent, 'supprimer')"
                                    >
                                        <Trash2 class="size-4" />
                                        Supprimer accès
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </AppSidebarLayout>
</template>
