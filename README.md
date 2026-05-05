# 🎸 Májová Regata · Hymnus Generator

Webová aplikace, která posádkám [Májové regaty](https://www.majovaregata.cz)
vygeneruje vlastní rockový hymnus — text písně, hotovou nahrávku s vokály,
permanentní stránku posádky a veřejnou galerii všech posádek.

Pohání ji **Google Gemini** (text), **Lyria 3** (hudba),
**Cloudflare R2** (úložiště MP3) a **SQLite** (metadata).

## Co aplikace dělá

```
Posádka vyplní formulář
        │
        ▼
Gemini Flash napíše český text písně
        │
        ▼
Lyria 3 nahraje skladbu s vokály
        │
        ▼
Server přechroupe WAV → MP3
        │
        ▼
Upload na Cloudflare R2 → veřejná URL
        │
        ▼
Záznam do SQLite (slug, jméno, datum, URL audia, text)
        │
        ▼
Posádka přesměrována na trvalý odkaz `/h/{slug}`
        │
        ▼
Hymnus se objeví v galerii `/hymny`
```

## Routes

| Cesta | Co dělá |
|-------|--------|
| `GET  /` | Formulář pro vytvoření hymnu |
| `POST /api/lyrics` | Vygeneruje text písně (Gemini Flash) |
| `POST /api/music` | Vygeneruje audio (Lyria 3) → MP3 → R2 → DB → vrátí slug |
| `GET  /h/:slug` | Veřejná stránka posádky (přehrávač + text + sdílení) |
| `GET  /hymny` | Galerie všech posádek |
| `GET  /api/hymns` | JSON list všech hymen (pro integrace) |
| `GET  /api/health` | Healthcheck |

Stránky `/h/:slug` mají Open Graph metadata — sdílení na FB/WhatsApp ukazuje
náhled s názvem posádky.

## Instalace

### 1) Předpoklady

- Node.js 20+
- Gemini API klíč → [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
  (pro Lyria 3 musí být v Google AI Studio aktivní billing)
- Cloudflare účet (zdarma) → [dash.cloudflare.com](https://dash.cloudflare.com)

### 2) Cloudflare R2 setup

Free tier R2 dává **10 GB úložiště + 10M operací měsíčně**, což stačí na
tisíce hymnů.

1. **Vytvoř bucket** — Cloudflare dashboard → R2 → Create bucket → název
   např. `majova-regata-hymny`.
2. **Povol veřejný přístup** — bucket → Settings → Public access →
   povol `r2.dev subdomain`. Cloudflare ti vygeneruje URL ve tvaru
   `https://pub-abc123xyz.r2.dev` — tu zkopíruj.
3. **Vytvoř API token** — R2 → Manage R2 API tokens → Create token →
   Permission: `Object Read & Write`, Resources: jen tenhle bucket.
   Vygeneruje se ti **Access Key ID** a **Secret Access Key** — uloží se
   pouze jednou, hned je zkopíruj.
4. Najdi **Account ID** v pravém sloupci R2 dashboardu.

### 3) Spuštění

```bash
npm install

# zkopíruj a vyplň .env
cp .env.example .env
# uprav .env a vlož:
#   GEMINI_API_KEY=AIza...
#   R2_ACCOUNT_ID=...
#   R2_ACCESS_KEY_ID=...
#   R2_SECRET_ACCESS_KEY=...
#   R2_BUCKET=majova-regata-hymny
#   R2_PUBLIC_URL=https://pub-xxxxxxxxxx.r2.dev

npm start
```

Otevři `http://localhost:3000`.

### Vývojářský režim s auto-reloadem

```bash
npm run dev
```

## Struktura projektu

```
majova-regata-anthem/
├── public/                  ← statické soubory
│   ├── index.html           ← formulář
│   └── styles.css           ← sdílené styly
├── lib/
│   ├── db.js                ← SQLite + slug generátor
│   ├── r2.js                ← Cloudflare R2 upload
│   ├── wav-to-mp3.js        ← server-side konverze
│   └── templates.js         ← SSR HTML pro /h/:slug a /hymny
├── data/
│   └── hymns.db             ← SQLite databáze (auto-vytvoří se)
├── server.js                ← Express app + routes
├── package.json
├── .env                     ← tvoje konfigurace (NIKDY do gitu!)
├── .env.example
├── .gitignore
└── README.md
```

## Datový model

```sql
CREATE TABLE hymns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    UNIQUE NOT NULL,    -- bourlivaci-x7k3
  crew_name    TEXT    NOT NULL,           -- "Bouřliváci"
  words        TEXT    NOT NULL,           -- vstupní popisná slova
  intensity    TEXT    NOT NULL,           -- classic / hard / metal
  length_kind  TEXT    NOT NULL,           -- clip / pro
  lyrics       TEXT    NOT NULL,           -- celý vygenerovaný text
  audio_url    TEXT    NOT NULL,           -- veřejná R2 URL
  audio_key    TEXT    NOT NULL,           -- key v R2 bucketu
  mime_type    TEXT    NOT NULL,
  duration_s   REAL,
  created_at   INTEGER NOT NULL,           -- unix ms
  ip_hash      TEXT                        -- hashed IP, ne plaintext
);
```

## Deployment

### Vercel / Railway / Render / Fly.io

1. Push do gitu (`.env` se necommituje díky `.gitignore`)
2. Nastav environment variables v dashboardu (všechny z `.env.example`)
3. Deploy

> ⚠️ **Pozor na serverless**: SQLite vyžaduje perzistentní disk.
> Vercel a klasický Lambda mají efemérní filesystem — DB se ztratí při
> restartu. Použij **Railway**, **Render** (s persistent disk),
> **Fly.io** (s volume), nebo klasický VPS.
> Případně přepiš `lib/db.js` na Cloudflare D1 / Turso / Supabase.

### VPS

```bash
git clone … majova-regata-anthem
cd majova-regata-anthem
npm ci --omit=dev
# vytvoř .env
pm2 start server.js --name majova-hymny
# nebo systemd unit
```

Před produkci nastav reverse proxy (nginx / Caddy) s HTTPS.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++   # pro better-sqlite3 build
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
VOLUME /app/data
CMD ["node", "server.js"]
```

## Náklady

| Služba | Free tier | Co stačí |
|--------|-----------|----------|
| Gemini 2.5 Flash (text) | velkorysý free tier | tisíce textů zdarma |
| Lyria 3 Clip / Pro (hudba) | **placené** — viz [ceník](https://ai.google.dev/gemini-api/docs/pricing) | hlavní položka |
| Cloudflare R2 | **10 GB + 10M req/měsíc zdarma** | 1000+ MP3 v 192 kbps |
| SQLite | zdarma | jeden soubor |

## Známé limity a tipy

- **Lyria 3 je v public preview** — kvalita českých vokálů kolísá.
  Doporuč uživatelům regenerovat, pokud výsledek nezní dobře.
- **Délka generování**: Clip 20–60 s, Pro 60–120 s. HTTP request
  zůstává otevřený celou dobu. Pokud máš reverse proxy, nastav timeout
  na alespoň 180 s.
- **Lyria 3 přidává neslyšitelný SynthID watermark** do všech tracků.
- **Rate limit**: výchozí 10 generování / 30 min na IP. Změň v `server.js`
  konstanty `RATE_WINDOW_MS` a `RATE_MAX`.
- **Mazání hymnů**: aktuálně není UI ani API endpoint. Smazat ručně přes
  SQLite + R2 dashboard.

## Co přidat dál (nápady)

- Email notifikace s odkazem (Resend free tier 3000 mailů/měsíc)
- Pin / heslo pro úpravu/smazání hymnu
- Filtry galerie (podle intenzity, datumu)
- Embed widget pro web regaty (`<iframe src="/h/{slug}/embed">`)
- Veřejná RSS kanál nových hymnů
- "Líbí se" počítadlo na detailu posádky

## Licence

MIT.
