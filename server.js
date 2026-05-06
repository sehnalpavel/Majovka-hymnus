// server.js — Májová Regata Hymnus Generator (v2)
// Backend: Express + SQLite + Cloudflare R2 + Gemini/Lyria 3

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { insertHymn, getHymnBySlug, listHymns, makeSlug, hashIp } from './lib/db.js';
import { uploadToR2, isR2Configured } from './lib/r2.js';
import { wavBufferToMp3 } from './lib/wav-to-mp3.js';
import { renderCrewPage, renderGalleryPage, renderNotFound } from './lib/templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

// ============== CONFIG ==============
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const TEXT_MODEL       = process.env.TEXT_MODEL       || 'gemini-2.5-flash';
const MUSIC_MODEL_CLIP = process.env.MUSIC_MODEL_CLIP || 'lyria-3-clip-preview';
const MUSIC_MODEL_PRO  = process.env.MUSIC_MODEL_PRO  || 'lyria-3-pro-preview';

if (!GEMINI_API_KEY){
  console.error('\n[FATAL] GEMINI_API_KEY chybí v .env. Vytvoř .env podle .env.example.\n');
  process.exit(1);
}
if (!isR2Configured()){
  console.error('\n[FATAL] Cloudflare R2 není nakonfigurované. Vyplň R2_* proměnné v .env.\n');
  process.exit(1);
}

const STYLE_PROMPTS = {
    classic: "classic rock anthem in the spirit of AC/DC and Thin Lizzy: clean-distorted Marshall guitars, driving 4/4 backbeat, gritty male lead vocals, anthemic chorus singalong, raw energy",
      hard: "hard rock anthem with heavy distorted electric guitars, pounding kick drums and crashing cymbals, thick bass guitar, aggressive male vocals, soaring anthemic chorus, big production",
        metal: "heavy metal anthem with palm-muted shredding guitars, double-bass drums, growling male lead vocal, screaming high notes in chorus, fast tempo around 160 bpm, raw and powerful",
          country: "modern country anthem in the style of Zac Brown Band and Eric Church: acoustic guitar strumming, electric guitar twang with light overdrive, pedal steel licks, kick-snare backbeat, warm male lead vocals with storytelling delivery, harmonized chorus, mid-tempo around 110 bpm, heartfelt and rousing",
            bluegrass: "bluegrass anthem in the style of Old Crow Medicine Show and Mumford & Sons: fast strummed acoustic guitar, banjo rolls, fiddle melody runs, upright bass walking lines, mandolin chops, tight male vocal harmonies, foot-stomping tempo around 130 bpm, joyful and rousing campfire energy"
            };

const INTENSITY_LABEL_CS = {
  classic: 'classic rock',
  hard: 'hard rock',
  metal: 'heavy metal',
  country: 'country',
  bluegrass: 'bluegrass'
};

// ============== MIDDLEWARE ==============
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory rate limiter per IP
const RATE_WINDOW_MS = 30 * 60 * 1000;
const RATE_MAX       = 10;
const rateBuckets = new Map();
function rateLimit(req, res, next){
  const ip  = req.ip || req.headers['x-forwarded-for'] || 'anon';
  const now = Date.now();
  const bucket = (rateBuckets.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (bucket.length >= RATE_MAX){
    return res.status(429).json({ error: 'Příliš mnoho požadavků z této IP. Zkus to za chvíli.' });
  }
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  next();
}

// ============== GEMINI HTTP CALL ==============
async function callGemini(model, body){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok){
    const txt = await res.text().catch(() => '');
    const err = new Error(`Gemini API ${res.status}: ${txt.slice(0, 600)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ============== /api/lyrics ==============
app.post('/api/lyrics', rateLimit, async (req, res) => {
  try {
    const { crewName, words, intensity } = req.body || {};
    if (!crewName || !words) return res.status(400).json({ error:'Chybí crewName nebo words.' });
    const cleanCrew  = String(crewName).slice(0, 80);
    const cleanWords = String(words).slice(0, 600);
    const intensityLabel = INTENSITY_LABEL_CS[intensity] || INTENSITY_LABEL_CS.hard;

    const prompt = `Jsi zkušený rockový textař. Napiš v češtině text písně v žánru ${intensityLabel} pro jachtařskou posádku jménem "${cleanCrew}", která se účastní Májové regaty (česká námořní jachtařská regata), která se účastní Májové regaty 2026 — legendárního závodu plachetnic (First, Salona) na chorvatskych vodach (murter, biograd, kaštela) — s 40+ loděmi, atmosférou kamarádství, grogu, večerních zabav na mole a urputné soutěžení

Posádku vystihují tato slova: "${cleanWords}"

POŽADAVKY NA STRUKTURU:
- Sloka 1 (4 řádky): představení posádky, charakter, život na moři, schéma rýmů ABAB
- Refrén (4 řádky): MUSÍ obsahovat výkřik jména "${cleanCrew}" 2x, anthemický, schéma AABB nebo ABAB
- Sloka 2 (4 řádky): dobrodružství, regata, vítr, ABAB rýmy
- Refrén (stejný hook se jménem, lehce jiné okolní řádky)
- Bridge (2 řádky): zlomový moment, AA rým
- Refrén (finální)

POŽADAVKY NA RÝMY (KRITICKÉ):
- KAŽDÝ řádek MUSÍ končit slovem, které se RÝMUJE s odpovídajícím řádkem (nejen vizuálně, ale ZVUKEM v mluvené češtině)
- Příklad správného rýmu: "vítr se honí" / "loď se kloní" (-oní / -oní zní stejně)
- Příklad ŠPATNÉHO rýmu: "moře" / "hoře" se ZNÁ PŘIROZENĚ stejně, ale "moře" / "kotva" NIKDY
- Před napsáním řádku si nahlas ověř, jestli koncové slabiky znějí stejně
- Lepší jednoduchý čistý rým než vznešený, který nesedí
- Pokud váháš mezi dvěma slovy, vyber to s lepším rýmem, i když mění význam
- ZAKÁZÁNO: rýmovat slovesa s -át, -ít, -et navzájem (líbat / vidět NENÍ rým)
- ZAKÁZÁNO: tzv. "oční rýmy" (slova co vypadají, ale neslyší se stejně)

POŽADAVKY NA JAZYK:
- Krátké údernější verše (7–10 slabik na řádek)
- Stejný počet slabik v rýmujících se řádcích (±1)
- Češtinu měj přirozenou, rytmickou, ne knižní ani archaickou
- Drsný, hrdý, ${intensityLabel} postoj
- Nautické obrazy: vlny, kotva, plachty, vítr, sůl, bouře, ráhno, kýl, paluba, mola, mokré dlaně, večerní oheň
- Použij konkrétní detaily, ne obecné fráze ("piva v krčmě" > "radost v duši")

ZAKÁZÁNO:
- Klišé: "hořící duše", "navěky", "srdce mé volá", "v žilách se vzedmou", "bouře v nás"
- Obecná abstrakta bez fyzického obrazu
- Anglicismy nebo přeložené idiomy

STYL:
- Drsný, hrdý, hard rock postoj
- Nautické obrazy: vlny, kotva, plachty, vítr, sůl, bouře, ráhno, kýl
- Krátké údernější verše (8–12 slabik)
- Češtinu měj přirozenou, rytmickou, ne knižní

PŘÍKLAD KVALITNÍHO REFRÉNU (jen jako vzor stylu, ne k opisování):

[Refrén]
"Bouřliváci, řvi to nahlas!     (rým A)
Nás ten vítr nikdy nezhasl!     (rým A)  
Bouřliváci, plachty napni,       (rým B)
S námi vlnu hravě naplňíš si!"   (rým B)

(Všimni si: -ahlas / -ezhasl je rytmicky čistý rým, -napni / -aplňíš si také.)

ZAKÁZÁNO: klišé typu „hořící duše", „navěky", „zní bouře v nás", „srdce mé volá", obecné fráze. Buď konkrétní, syrový, drsný.

Odpověz POUZE textem písně se značkami sekcí ve hranatých závorkách: [Sloka 1], [Refrén], [Sloka 2], [Refrén], [Bridge], [Refrén]. Žádný komentář.`;

    const data = await callGemini(TEXT_MODEL, {
      contents: [{ role:'user', parts:[{ text: prompt }] }],
      generationConfig: { temperature: 0.85, topP: 0.95 }
    });

    const lyrics = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text).filter(Boolean).join('\n').trim();
    if (!lyrics) return res.status(502).json({ error:'Gemini nevrátil text. Zkus regenerovat.' });

    res.json({ lyrics });
  } catch (err){
    console.error('[/api/lyrics]', err);
    res.status(err.status || 500).json({ error: err.message || 'Interní chyba serveru.' });
  }
});

// ============== /api/music ==============
// Generuje audio přes Lyria 3, konvertuje na MP3, uploaduje do R2, ukládá do DB.
// Vrací { slug, permalinkUrl, audioUrl } — frontend pak přesměruje na /h/{slug}.
app.post('/api/music', rateLimit, async (req, res) => {
  try {
    const { lyrics, crewName, words, intensity, length } = req.body || {};
    if (!lyrics || !crewName) return res.status(400).json({ error:'Chybí lyrics nebo crewName.' });

    const styleText = STYLE_PROMPTS[intensity] || STYLE_PROMPTS.hard;
    const useProModel = length === 'pro';
    const model = useProModel ? MUSIC_MODEL_PRO : MUSIC_MODEL_CLIP;

    const musicPrompt = `${styleText}.
Theme: a Czech yacht-racing crew called "${crewName}" competing in the Májová Regata sailing race in 2026, racing on Czech reservoirs with passion and team spirit.
Vocals: powerful raw male lead vocal in CZECH language, anthemic shout-along chorus where the crew name "${crewName}" is shouted multiple times.
The lyrics (in Czech) to perform are below — follow this song structure with verses and choruses:

${lyrics}

Production: big arena rock production, wall of guitars, driving drums, audible chorus hook with the crew name. Energetic, anthemic.`;

    // 1) Vygeneruj audio přes Gemini (Lyria 3)
    const data = await callGemini(model, {
      contents: [{ role:'user', parts:[{ text: musicPrompt }] }]
    });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let audioPart = null;
    for (const p of parts){
      const inline = p.inlineData || p.inline_data;
      const mt     = inline?.mimeType || inline?.mime_type;
      if (mt && mt.startsWith('audio/')){ audioPart = inline; break; }
    }
    if (!audioPart || !audioPart.data){
      console.error('[Lyria] No audio in response:', JSON.stringify(data).slice(0,800));
      return res.status(502).json({
        error: 'Lyria 3 nevrátila audio. Možné příčiny: model nedostupný v regionu, projekt bez billingu, safety filtr.'
      });
    }

    const sourceMime = audioPart.mimeType || audioPart.mime_type || 'audio/wav';
    const audioBuffer = Buffer.from(audioPart.data, 'base64');

    // 2) WAV → MP3 (server-side přes lamejs)
    let mp3Buffer, durationS = null, finalMime = sourceMime;
    if (sourceMime.includes('wav') || sourceMime.includes('x-wav') || sourceMime.includes('pcm')){
      const result = wavBufferToMp3(audioBuffer, 192);
      mp3Buffer = result.mp3;
      durationS = result.durationS;
      finalMime = 'audio/mpeg';
    } else {
      // Pokud Lyria vrátí už něco jiného (mp3, ogg…), zachováme to
      mp3Buffer = audioBuffer;
    }

    // 3) Upload na R2
    const slug = makeSlug(crewName);
    const ext  = finalMime === 'audio/mpeg' ? 'mp3' : (finalMime.split('/')[1] || 'audio');
    const key  = `hymns/${slug}.${ext}`;
    const { publicUrl } = await uploadToR2(key, mp3Buffer, finalMime);

    // 4) Insert do DB
    const ip = req.ip || req.headers['x-forwarded-for'] || 'anon';
    insertHymn({
      slug,
      crewName: String(crewName).slice(0, 80),
      words: String(words || '').slice(0, 600),
      intensity: ['classic','hard','metal'].includes(intensity) ? intensity : 'hard',
      lengthKind: length === 'pro' ? 'pro' : 'clip',
      lyrics,
      audioUrl: publicUrl,
      audioKey: key,
      mimeType: finalMime,
      durationS,
      createdAt: Date.now(),
      ipHash: hashIp(ip)
    });

    const permalinkUrl = `/h/${slug}`;
    res.json({
      slug,
      permalinkUrl,
      audioUrl: publicUrl,
      fullUrl: `${PUBLIC_BASE_URL}${permalinkUrl}`
    });

  } catch (err){
    console.error('[/api/music]', err);
    res.status(err.status || 500).json({ error: err.message || 'Interní chyba serveru.' });
  }
});

// ============== HTML ROUTES ==============

// Detail posádky
app.get('/h/:slug', (req, res) => {
  const hymn = getHymnBySlug(req.params.slug);
  if (!hymn){
    res.status(404).type('html').send(renderNotFound(PUBLIC_BASE_URL));
    return;
  }
  res.type('html').send(renderCrewPage(hymn, PUBLIC_BASE_URL));
});

// Galerie
app.get('/hymny', (req, res) => {
  const data = listHymns({ limit: 120, offset: 0 });
  res.type('html').send(renderGalleryPage(data, PUBLIC_BASE_URL));
});

// JSON list (pro případné integrace, RSS apod.)
app.get('/api/hymns', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 60, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  res.json(listHymns({ limit, offset }));
});

// Healthcheck
app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// ============== START ==============
app.listen(PORT, () => {
  console.log(`\n  🌊  Májová Regata Hymnus Generator v2`);
  console.log(`  ▶  http://localhost:${PORT}`);
  console.log(`  ▶  Galerie:     ${PUBLIC_BASE_URL}/hymny`);
  console.log(`  ▶  Text model:  ${TEXT_MODEL}`);
  console.log(`  ▶  Music clip:  ${MUSIC_MODEL_CLIP}`);
  console.log(`  ▶  Music pro:   ${MUSIC_MODEL_PRO}`);
  console.log(`  ▶  Storage:     Cloudflare R2 (${process.env.R2_BUCKET})`);
  console.log(`  ▶  DB:          ./data/hymns.db\n`);
});
