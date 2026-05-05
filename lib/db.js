// lib/db.js - SQLite úložiště metadat hymen
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR umožňuje Railway / Render mountnout persistent volume sem.
// Lokálně default = ./data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'hymns.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS hymns (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT    UNIQUE NOT NULL,
    crew_name    TEXT    NOT NULL,
    words        TEXT    NOT NULL,
    intensity    TEXT    NOT NULL,
    length_kind  TEXT    NOT NULL,
    lyrics       TEXT    NOT NULL,
    audio_url    TEXT    NOT NULL,
    audio_key    TEXT    NOT NULL,
    mime_type    TEXT    NOT NULL,
    duration_s   REAL,
    created_at   INTEGER NOT NULL,
    ip_hash      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_hymns_created ON hymns (created_at DESC);
`);

// Slug generation: "Bouřliváci" → "bourlivaci-x7k3"
export function makeSlug(crewName){
  const base = String(crewName).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 30) || 'hymna';
  // 4-char random suffix to make collisions effectively impossible
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base}-${suffix}`;
}

// Insert hymn record
const insertStmt = db.prepare(`
  INSERT INTO hymns (slug, crew_name, words, intensity, length_kind, lyrics, audio_url, audio_key, mime_type, duration_s, created_at, ip_hash)
  VALUES (@slug, @crewName, @words, @intensity, @lengthKind, @lyrics, @audioUrl, @audioKey, @mimeType, @durationS, @createdAt, @ipHash)
`);
export function insertHymn(record){
  insertStmt.run(record);
  return record;
}

// Single fetch
const getBySlugStmt = db.prepare(`SELECT * FROM hymns WHERE slug = ?`);
export function getHymnBySlug(slug){
  return getBySlugStmt.get(slug) || null;
}

// List for gallery (newest first)
const listStmt = db.prepare(`
  SELECT slug, crew_name, intensity, length_kind, audio_url, created_at
  FROM hymns
  ORDER BY created_at DESC
  LIMIT @limit OFFSET @offset
`);
const countStmt = db.prepare(`SELECT COUNT(*) as count FROM hymns`);
export function listHymns({ limit = 60, offset = 0 } = {}){
  return {
    items: listStmt.all({ limit, offset }),
    total: countStmt.get().count
  };
}

// Hash IP for soft attribution / rate-limit context (no plaintext IP stored)
export function hashIp(ip){
  return crypto.createHash('sha256').update(String(ip || 'anon') + '|majova-2026').digest('hex').slice(0, 16);
}

export default db;
