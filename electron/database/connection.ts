import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (db) return db;

    const dbPath = join(app.getPath('userData'), 'gar-desktop.sqlite3');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    return db;
}
