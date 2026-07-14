import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { queueManager } from '../sync/QueueManager';

export interface ClientRow {
    id: number;
    uuid: string;
    nom: string | null;
    prenoms: string | null;
    telephone: string | null;
    cni: string | null;
    source: string;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface InfosClient {
    nom?: string | null;
    prenoms?: string | null;
    telephone?: string | null;
    cni?: string | null;
}

export interface ClientServeur {
    uuid: string;
    nom: string | null;
    prenoms: string | null;
    telephone: string | null;
    cni: string | null;
    source?: string | null;
    created_at: string | null;
    updated_at: string | null;
}

function normaliserTelephone(telephone: string | null | undefined) {
    return (telephone ?? '').replace(/\D+/g, '');
}

export class ClientRepository {
    parTelephone(telephone: string, source = 'ticket'): ClientRow | null {
        const telephoneNettoye = telephone.trim();
        const telephoneNormalise = normaliserTelephone(telephoneNettoye);
        if (!telephoneNettoye && !telephoneNormalise) return null;

        const sql = telephoneNormalise
            ? `SELECT id, uuid, nom, prenoms, telephone, cni, source
               FROM clients
               WHERE source = ?
                 AND (telephone = ?
                  OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telephone, ''), ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''), '+', '') = ?)
               LIMIT 1`
            : 'SELECT id, uuid, nom, prenoms, telephone, cni, source FROM clients WHERE source = ? AND telephone = ? LIMIT 1';
        const params = telephoneNormalise ? [source, telephoneNettoye, telephoneNormalise] : [source, telephoneNettoye];
        const ligne = getDb().prepare(sql).get(...params) as ClientRow | undefined;

        return ligne ?? null;
    }

    exporterParTelephone(telephone: string): ClientServeur | null {
        const client = this.parTelephone(telephone, 'ticket');
        if (!client) return null;

        return getDb()
            .prepare('SELECT uuid, nom, prenoms, telephone, cni, source, created_at, updated_at FROM clients WHERE id = ? LIMIT 1')
            .get(client.id) as ClientServeur | null;
    }

    importerDepuisServeur(client: ClientServeur | null | undefined): number | null {
        if (!client?.uuid) return null;

        const db = getDb();
        const maintenant = new Date().toISOString();
        const telephone = client.telephone?.trim() || null;
        const source = client.source === 'courrier' ? 'courrier' : 'ticket';
        const existantParUuid = db
            .prepare('SELECT id FROM clients WHERE uuid = ? AND source = ? LIMIT 1')
            .get(client.uuid, source) as { id: number } | undefined;
        const existantParTelephone = !existantParUuid && telephone ? this.parTelephone(telephone, source) : null;
        const id = existantParUuid?.id ?? existantParTelephone?.id ?? null;
        const payload = {
            uuid: client.uuid,
            nom: client.nom,
            prenoms: client.prenoms,
            telephone,
            cni: client.cni,
            source,
            created_at: client.created_at ?? maintenant,
            updated_at: client.updated_at ?? maintenant,
        };

        if (id) {
            db.prepare(
                `UPDATE clients
                 SET uuid = @uuid,
                     nom = @nom,
                     prenoms = @prenoms,
                     telephone = @telephone,
                     cni = @cni,
                     source = @source,
                     updated_at = @updated_at
                 WHERE id = @id`,
            ).run({ ...payload, id });

            return id;
        }

        const info = db.prepare(
            `INSERT INTO clients (uuid, nom, prenoms, telephone, cni, source, created_at, updated_at)
             VALUES (@uuid, @nom, @prenoms, @telephone, @cni, @source, @created_at, @updated_at)`,
        ).run(payload);

        return Number(info.lastInsertRowid);
    }

    // Dédoublonnage par téléphone : si le client existe déjà, on complète sa
    // fiche avec les infos saisies avant de l'utiliser dans le payload sync.
    trouverOuCreer(infos: InfosClient, source = 'ticket'): ClientRow | null {
        const aDesInfos = infos.nom || infos.prenoms || infos.telephone || infos.cni;
        if (!aDesInfos) return null;

        if (infos.telephone) {
            const existant = this.parTelephone(infos.telephone, source);
            if (existant) return this.mettreAJourSiBesoin(existant, infos);
        }

        const uuid = nouvelUuid();
        const maintenant = new Date().toISOString();
        const info = getDb()
            .prepare(
                `INSERT INTO clients (uuid, nom, prenoms, telephone, cni, source, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(uuid, infos.nom ?? null, infos.prenoms ?? null, infos.telephone ?? null, infos.cni ?? null, source, maintenant, maintenant);

        queueManager.ajouter('clients', uuid, { ...infos, uuid, source });

        return { id: Number(info.lastInsertRowid), uuid, nom: infos.nom ?? null, prenoms: infos.prenoms ?? null, telephone: infos.telephone ?? null, cni: infos.cni ?? null, source };
    }

    private mettreAJourSiBesoin(client: ClientRow, infos: InfosClient): ClientRow {
        const valeurs = {
            nom: this.valeurRenseignee(infos.nom) ?? client.nom,
            prenoms: this.valeurRenseignee(infos.prenoms) ?? client.prenoms,
            telephone: this.valeurRenseignee(infos.telephone) ?? client.telephone,
            cni: this.valeurRenseignee(infos.cni) ?? client.cni,
        };
        const change = valeurs.nom !== client.nom
            || valeurs.prenoms !== client.prenoms
            || valeurs.telephone !== client.telephone
            || valeurs.cni !== client.cni;

        if (!change) return client;

        const maintenant = new Date().toISOString();
        getDb()
            .prepare(
                `UPDATE clients
                 SET nom = ?, prenoms = ?, telephone = ?, cni = ?, updated_at = ?
                 WHERE id = ?`,
            )
            .run(valeurs.nom, valeurs.prenoms, valeurs.telephone, valeurs.cni, maintenant, client.id);

        queueManager.ajouter('clients', client.uuid, { ...valeurs, uuid: client.uuid, source: client.source }, 'update');

        return { ...client, ...valeurs, updated_at: maintenant };
    }

    private valeurRenseignee(valeur: string | null | undefined): string | null {
        const nettoyee = valeur?.trim();

        return nettoyee ? nettoyee : null;
    }
}
