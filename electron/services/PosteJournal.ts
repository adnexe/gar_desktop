import { randomUUID } from 'node:crypto';

export interface ActeurPoste {
    user_uuid: string;
    agent_uuid: string | null;
    agent_nom: string;
}

export interface PeriodePoste {
    uuid: string;
    type: 'application' | 'session';
    date_jour: string;
    debut_local: string;
    dernier_signal_local: string;
    fin_local: string | null;
    fin_motif: string | null;
    fermeture_estimee: boolean;
    duree_ms: number;
    revision: number;
    acteur: ActeurPoste | null;
}

export function horlogeLocale(date: Date): string {
    const n = (v: number) => String(v).padStart(2, '0');
    return `${date.getFullYear()}-${n(date.getMonth() + 1)}-${n(date.getDate())}T${n(date.getHours())}:${n(date.getMinutes())}:${n(date.getSeconds())}`;
}

// Le temps ecoule vient d'une horloge monotone, jamais de l'heure Windows.
export class PosteJournal {
    private actives: PeriodePoste[] = [];
    private precedent: Date;
    private monotone: number;
    private precedenteLocale: string;
    private sauver: (periode: PeriodePoste) => void;

    constructor(sauver: (periode: PeriodePoste) => void, date: Date, monotone: number, anciennes: PeriodePoste[] = []) {
        this.sauver = sauver;
        this.precedent = date;
        this.precedenteLocale = horlogeLocale(date);
        this.monotone = monotone;
        for (const periode of anciennes) {
            this.sauver({ ...periode, fin_local: periode.dernier_signal_local, fin_motif: 'interruption', fermeture_estimee: true, revision: periode.revision + 1 });
        }
        this.ouvrir('application', date, null);
    }

    private ouvrir(type: PeriodePoste['type'], date: Date, acteur: ActeurPoste | null): void {
        const heure = horlogeLocale(date);
        const periode: PeriodePoste = { uuid: randomUUID(), type, date_jour: heure.slice(0, 10), debut_local: heure,
            dernier_signal_local: heure, fin_local: null, fin_motif: null, fermeture_estimee: false, duree_ms: 0, revision: 1, acteur };
        this.actives.push(periode);
        this.sauver(periode);
    }

    private fermer(periode: PeriodePoste, date: string, motif: string, estimee = false): void {
        periode.fin_local = date;
        periode.fin_motif = motif;
        periode.fermeture_estimee = estimee;
        periode.revision++;
        this.sauver(periode);
        this.actives = this.actives.filter((p) => p !== periode);
    }

    avancer(date: Date, monotone: number): void {
        const delta = Math.max(0, Math.round(monotone - this.monotone));
        const mur = date.getTime() - this.precedent.getTime();
        const murLocal = Date.parse(horlogeLocale(date) + 'Z') - Date.parse(this.precedenteLocale + 'Z');
        if (delta > 90000 || Math.abs(mur - delta) > 5000 || Math.abs(murLocal - delta) > 5000) {
            // Veille non signalee, processus bloque ou horloge corrigee : ne pas inventer l'intervalle manquant.
            for (const periode of [...this.actives]) {
                this.fermer(periode, periode.dernier_signal_local, 'intervalle_inconnu', true);
                this.ouvrir(periode.type, date, periode.acteur);
            }
        } else {
            const lendemain = new Date(this.precedent);
            lendemain.setHours(24, 0, 0, 0);
            for (let periode of [...this.actives]) {
                if (horlogeLocale(date).slice(0, 10) !== periode.date_jour) {
                    const avantMinuit = Math.max(0, Math.min(delta, lendemain.getTime() - this.precedent.getTime()));
                    periode.duree_ms += avantMinuit;
                    periode.dernier_signal_local = horlogeLocale(lendemain);
                    this.fermer(periode, horlogeLocale(lendemain), 'minuit');
                    this.ouvrir(periode.type, lendemain, periode.acteur);
                    periode = this.actives[this.actives.length - 1]!;
                    periode.duree_ms += delta - avantMinuit;
                } else {
                    periode.duree_ms += delta;
                }
                periode.dernier_signal_local = horlogeLocale(date);
                periode.revision++;
                this.sauver(periode);
            }
        }
        this.precedent = date;
        this.precedenteLocale = horlogeLocale(date);
        this.monotone = monotone;
    }

    session(acteur: ActeurPoste | null, date: Date, monotone: number, motif = 'deconnexion'): void {
        this.avancer(date, monotone);
        const actuelle = this.actives.find((p) => p.type === 'session');
        if (actuelle?.acteur?.user_uuid === acteur?.user_uuid) return;
        if (actuelle) this.fermer(actuelle, horlogeLocale(date), motif);
        if (acteur) this.ouvrir('session', date, acteur);
    }

    fermerTout(date: Date, monotone: number, motif: string): void {
        this.avancer(date, monotone);
        for (const periode of [...this.actives]) this.fermer(periode, horlogeLocale(date), motif);
    }
}
