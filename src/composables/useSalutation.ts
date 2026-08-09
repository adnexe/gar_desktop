// Salutation qui change selon l'heure et le jour — plusieurs variantes par
// moment pour que ça reste vivant. À tirer une seule fois par ouverture
// d'écran/dialog (pas de changement en cours d'affichage).
export function choisirSalutation(): string {
    const maintenant = new Date();
    const heure = maintenant.getHours();
    const estVendredi = maintenant.getDay() === 5;

    const variantes = estVendredi
        ? ['Bon vendredi 🎉', 'Dernière ligne droite de la semaine 💪', "On tient bon, c'est vendredi 🙌"]
        : heure < 12
            ? ['Bonjour ☀️', 'Belle journée à toi 🌞', 'Bon matin ☕']
            : heure < 15
                ? ['Bon courage pour la suite 💪', 'Bel après-midi 🌤️']
                : heure < 19
                    ? ['Bon après-midi ☀️', 'Courage pour la fin de journée 💪']
                    : ['Bonsoir 🌙', 'Belle fin de journée ✨'];

    return variantes[Math.floor(Math.random() * variantes.length)];
}
