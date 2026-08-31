let attente: Promise<unknown> = Promise.resolve();

// Le catalogue ne doit pas remplacer un nouveau mot de passe par une
// ancienne reponse recue pendant sa modification. Ne verrouille pas les ventes.
export function avecVerrouComptes<T>(operation: () => Promise<T>): Promise<T> {
    const resultat = attente.then(operation);
    attente = resultat.catch(() => undefined);
    return resultat;
}
