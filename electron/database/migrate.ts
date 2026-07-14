import type Database from 'better-sqlite3';
import { migrations } from './migrations';

export function migrer(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            nom TEXT PRIMARY KEY,
            appliquee_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
    `);

    const dejaAppliquees = new Set(
        db.prepare('SELECT nom FROM migrations').all().map((ligne) => (ligne as { nom: string }).nom),
    );

    const marquerAppliquee = db.prepare('INSERT INTO migrations (nom) VALUES (?)');

    for (const migration of migrations) {
        if (dejaAppliquees.has(migration.nom)) continue;

        db.transaction(() => {
            db.exec(migration.sql);
            marquerAppliquee.run(migration.nom);
        })();
    }
}
