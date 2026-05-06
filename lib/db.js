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
    created_at INTEGER NOT NULL,
    ip_hash TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_hymns_created ON hymns(created_at DESC);
`);

const insertStmt = db.prepare(
  `INSERT INTO hymns (id, slug, crew_name, words, intensity, length, lyrics, audio_url, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const selectBySlugStmt = db.prepare(`SELECT * FROM hymns WHERE slug = ?`);
const selectAllStmt = db.prepare(`SELECT * FROM hymns ORDER BY created_at DESC LIMIT ?`);
const countByIpSinceStmt = db.prepare(`SELECT COUNT(*) AS c FROM hymns WHERE ip_hash = ? AND created_at > ?`);

export function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 16);
}

export function makeSlug(crewName) {
  const base = String(crewName || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'hymn';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

export function saveHymn({ crewName, words, intensity, length, lyrics, audioUrl, ipHash }) {
  const id = crypto.randomUUID();
  const slug = makeSlug(crewName);
  const createdAt = Date.now();
  insertStmt.run(id, slug, crewName, words, intensity, length, lyrics, audioUrl, createdAt, ipHash || null);
  return { id, slug, crewName, words, intensity, length, lyrics, audioUrl, createdAt };
}

export function getHymnBySlug(slug) {
  return selectBySlugStmt.get(slug) || null;
}

export function getAllHymns(limit = 100) {
  return selectAllStmt.all(limit);
}

export function countRecentByIp(ipHash, sinceMs) {
  const row = countByIpSinceStmt.get(ipHash, sinceMs);
  return row?.c ?? 0;
}
// Aliasy pro kompatibilitu se server.js
export function insertHymn(data) {
  return saveHymn({
    crewName: data.crewName ?? data.crew_name,
    words: data.words,
    intensity: data.intensity,
    length: data.length,
    lyrics: data.lyrics,
    audioUrl: data.audioUrl ?? data.audio_url,
    ipHash: data.ipHash ?? data.ip_hash
  });
}

export function listHymns(limit = 100) {
  return getAllHymns(limit);
}
export default db;
