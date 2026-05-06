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
const countByIpSinceStmt = db.prepare(`SELECT COUNT(*) AS c FROM hymns WHERE ip_hash = ? AND created_at > ?`);
const countAllStmt = db.prepare(`SELECT COUNT(*) AS c FROM hymns`);

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

export function insertHymn(data) {
  const id = data.id || crypto.randomUUID();
  const slug = String(data.slug ?? '');
  if (!slug) throw new Error('insertHymn: slug is required');
  const createdAt = Number(data.createdAt ?? data.created_at ?? Date.now());
  const audioUrl = String(
    data.audioUrl ?? data.audio_url ?? data.audioPublicUrl ?? data.publicUrl ?? ''
  );
  insertStmt.run(
    id,
    slug,
    String(data.crewName ?? data.crew_name ?? ''),
    String(data.words ?? ''),
    String(data.intensity ?? 'hard'),
    String(data.length ?? 'clip'),
    String(data.lyrics ?? ''),
    audioUrl,
    createdAt,
    data.ipHash ?? data.ip_hash ?? null
  );
  return { id, slug, ...data, audioUrl, createdAt };
}

export function getHymnBySlug(slug) {
  return selectBySlugStmt.get(String(slug)) || null;
}

export function listHymns(opts = {}) {
  const limitRaw = typeof opts === 'number' ? opts : opts.limit;
  const offsetRaw = typeof opts === 'number' ? 0 : opts.offset;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 100;
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const hymns = db.prepare(
    `SELECT * FROM hymns ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
  ).all();
  const total = countAllStmt.get()?.c ?? 0;
  return { hymns, total, limit, offset };
}

export function getAllHymns(limit = 100) {
  return listHymns({ limit }).hymns;
}

export function saveHymn(data) {
  const slug = data.slug || makeSlug(data.crewName ?? data.crew_name);
  return insertHymn({ ...data, slug });
}

export function countRecentByIp(ipHash, sinceMs) {
  const row = countByIpSinceStmt.get(ipHash, sinceMs);
  return row?.c ?? 0;
}

export default db;
