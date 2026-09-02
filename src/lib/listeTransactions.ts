export function insererEnTeteSansDoublon<T extends { uuid: string }>(elements: T[], element: T): T[] {
    return [element, ...elements.filter((courant) => courant.uuid !== element.uuid)];
}

export function creerProtectionChargement() {
    let revision = 0;

    return {
        commencer() {
            revision += 1;
            return revision;
        },
        invalider() {
            revision += 1;
        },
        estCourant(revisionChargement: number) {
            return revisionChargement === revision;
        },
    };
}
