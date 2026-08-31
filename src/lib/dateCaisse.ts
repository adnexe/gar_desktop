const pad = (valeur: number) => String(valeur).padStart(2, '0');

// La journée de caisse suit la date affichée sur le poste. Le processus
// principal la stocke ensuite explicitement comme heure métier d'Abidjan.
export function dateCaisseDuJour(date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
