import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'hymns.db');

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS hymns (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    crew_name TEXT NOT NULL,
    words TEXT NOT NULL,
    intensity TEXT NOT NULL,
    length TEXT NOT NULL,
    lyrics TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_hymns_created ON hymns(created_at DESC);
`);

const insertStmt = db.prepare(
  `INSERT INTO hymns (id, slug, crew_name, words, intensity, length, lyrics, audio_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const selectBySlugStmt = db.prepare(`SELECT * FROM hymns WHERE slug = ?`);
const selectAllStmt = db.prepare(`SELECT * FROM hymns ORDER BY created_at DESC LIMIT ?`);

function makeSlug(crewName) {
  const base = crewName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'hymn';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

export function saveHymn({ crewName, words, intensity, length, lyrics, audioUrl }) {
  const id = crypto.randomUUID();
  const slug = makeSlug(crewName);
  const createdAt = Date.now();
  insertStmt.run(id, slug, crewName, words, intensity, length, lyrics, audioUrl, createdAt);
  return { id, slug, crewName, words, intensity, length, lyrics, audioUrl, createdAt };
}

export function getHymnBySlug(slug) {
  return selectBySlugStmt.get(slug) || null;
}

export function getAllHymns(limit = 100) {
  return selectAllStmt.all(limit);
}

export default db;
