// lib/templates.js — SSR HTML pro stránku posádky a galerii
// Sdílené styly z /styles.css (statický soubor v public/)

const INTENSITY_LABEL = {
  classic: 'Classic Rock',
  hard:    'Hard Rock',
  metal:   'Heavy Metal'
};
const LENGTH_LABEL = {
  clip: 'Clip · 30 s',
  pro:  'Pro · až 3 min'
};

function escapeHtml(s){
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(ts){
  const d = new Date(ts);
  return d.toLocaleDateString('cs-CZ', { day:'numeric', month:'long', year:'numeric' });
}

function shortLyricsTeaser(lyrics, maxLen = 140){
  const firstLines = lyrics
    .split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('['))
    .slice(0, 2)
    .join(' · ');
  return firstLines.length > maxLen ? firstLines.slice(0, maxLen - 1) + '…' : firstLines;
}

// ==================== PAGE: /h/:slug ====================
export function renderCrewPage(hymn, baseUrl){
  const crew = escapeHtml(hymn.crew_name);
  const lyrics = escapeHtml(hymn.lyrics);
  const audioUrl = escapeHtml(hymn.audio_url);
  const intensity = INTENSITY_LABEL[hymn.intensity] || 'Hard Rock';
  const lengthLbl = LENGTH_LABEL[hymn.length_kind] || 'Clip · 30 s';
  const date = formatDate(hymn.created_at);
  const teaser = escapeHtml(shortLyricsTeaser(hymn.lyrics));
  const pageUrl = `${baseUrl}/h/${encodeURIComponent(hymn.slug)}`;

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${crew} · Hymnus posádky · Májová Regata 2026</title>
<meta name="description" content="${teaser}">

<!-- Open Graph (sdílení) -->
<meta property="og:type" content="music.song">
<meta property="og:title" content="HYMNUS POSÁDKY ${crew} · Májová Regata 2026">
<meta property="og:description" content="${teaser}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:audio" content="${audioUrl}">
<meta property="og:audio:type" content="audio/mpeg">
<meta property="og:site_name" content="Májová Regata 2026">
<meta name="twitter:card" content="summary_large_image">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<header class="site-header">
  <a class="menu-link" href="/">⟵ Vytvořit vlastní</a>
  <a class="brand" href="https://www.majovaregata.cz" target="_blank" aria-label="Májová regata">
    <span class="brand-icon">
      <svg viewBox="0 0 18 22" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 1 L15 11 L9 11 L9 21 L7 21 L7 11 L3 11 Z" fill="#ee7e6c"/>
      </svg>
    </span>
    <span class="brand-text">Májová<br>Regata</span>
  </a>
</header>

<section class="hero hero-crew">
  <div class="hero-inner">
    <div class="hero-kicker">⚓ Hymnus posádky · ${date}</div>
    <h1>${crew}</h1>
    <div class="hero-sub">${intensity.replace(/(.)/g,'$1 ').trim()}</div>
  </div>
  <a href="#prehravac" class="scroll-cue">Poslech</a>
</section>

<section class="section" id="prehravac">
  <span class="section-num">01</span>
  <div class="section-inner">
    <div class="section-kicker">${intensity} · ${lengthLbl}</div>
    <h2>Audio<br>stopa</h2>

    <div class="player">
      <div class="player-label">⚡ Přehrávač</div>
      <audio controls preload="metadata" src="${audioUrl}"></audio>
      <div class="action-row">
        <a class="btn-ghost coral" href="${audioUrl}" download="${escapeHtml(hymn.crew_name).replace(/[^\w-]/g,'_')}_majova_regata.mp3">⬇ Stáhnout MP3</a>
        <button class="btn-ghost" data-share="copy" data-url="${pageUrl}">⎘ Kopírovat odkaz</button>
        <a class="btn-ghost" target="_blank" rel="noopener"
           href="https://wa.me/?text=${encodeURIComponent(`Hymnus posádky ${hymn.crew_name}: ${pageUrl}`)}">↗ WhatsApp</a>
        <a class="btn-ghost" target="_blank" rel="noopener"
           href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}">↗ Facebook</a>
      </div>
    </div>
  </div>
</section>

<section class="section alt">
  <span class="section-num">02</span>
  <div class="section-inner">
    <div class="section-kicker">⚓ Text písně</div>
    <h2>Lodní<br>deník</h2>

    <div class="player">
      <div class="player-label">Slova hymnu</div>
      <div class="lyrics-block">${lyrics}</div>
      <div class="action-row">
        <button class="btn-ghost" data-copy-lyrics>⎘ Kopírovat text</button>
      </div>
    </div>

    <div style="margin-top:48px;text-align:center">
      <a href="/hymny" class="btn-outline" style="margin:8px">⚓ Galerie všech posádek</a>
      <a href="/" class="btn-outline" style="margin:8px">⚡ Vytvořit vlastní hymnus</a>
    </div>
  </div>
</section>

<footer>
  <div class="small">Projekt fanoušků <a href="https://www.majovaregata.cz" target="_blank">Májové regaty</a></div>
  <div class="small" style="opacity:.7">Powered by Google Gemini · Lyria 3</div>
</footer>

<script>
  // Lyrics for clipboard
  const RAW_LYRICS = ${JSON.stringify(hymn.lyrics)};
  const PAGE_URL = ${JSON.stringify(pageUrl)};

  document.querySelectorAll('[data-copy-lyrics]').forEach(b => {
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(RAW_LYRICS); b.textContent='✓ Zkopírováno';
        setTimeout(()=>b.textContent='⎘ Kopírovat text',1500);
      } catch { alert('Nepodařilo se zkopírovat.'); }
    });
  });
  document.querySelectorAll('[data-share="copy"]').forEach(b => {
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.url || PAGE_URL); b.textContent='✓ Odkaz zkopírován';
        setTimeout(()=>b.textContent='⎘ Kopírovat odkaz',1800);
      } catch { alert('Nepodařilo se zkopírovat.'); }
    });
  });
</script>
</body>
</html>`;
}

// ==================== PAGE: /hymny (galerie) ====================
export function renderGalleryPage({ items, total }, baseUrl){
  const cards = items.map(h => {
    const intensityLbl = INTENSITY_LABEL[h.intensity] || 'Hard Rock';
    const date = formatDate(h.created_at);
    return `
    <a class="hymn-card" href="/h/${encodeURIComponent(h.slug)}">
      <div class="hymn-card-inner">
        <div class="hymn-card-meta">${date} · ${intensityLbl}</div>
        <div class="hymn-card-name">${escapeHtml(h.crew_name)}</div>
        <div class="hymn-card-cta">⚡ Poslechnout →</div>
      </div>
    </a>`;
  }).join('');

  const empty = total === 0 ? `
    <div style="text-align:center;padding:80px 20px;max-width:520px;margin:0 auto;">
      <div class="section-kicker">Galerie je prázdná</div>
      <h2 style="margin-bottom:24px">Buď první</h2>
      <p class="lede" style="margin:0 auto 32px">
        Žádná posádka ještě nevykovala svůj hymnus. Vytvoř první kus.
      </p>
      <a href="/" class="btn-primary">Vytvořit hymnus</a>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Galerie hymen · Májová Regata 2026</title>
<meta name="description" content="Všechny hymny posádek Májové regaty 2026.">
<meta property="og:title" content="Galerie hymen · Májová Regata 2026">
<meta property="og:description" content="Hard rock hymny posádek Májové regaty 2026.">
<meta property="og:url" content="${baseUrl}/hymny">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<header class="site-header">
  <a class="menu-link" href="/">⟵ Vytvořit hymnus</a>
  <a class="brand" href="https://www.majovaregata.cz" target="_blank">
    <span class="brand-icon">
      <svg viewBox="0 0 18 22" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 1 L15 11 L9 11 L9 21 L7 21 L7 11 L3 11 Z" fill="#ee7e6c"/>
      </svg>
    </span>
    <span class="brand-text">Májová<br>Regata</span>
  </a>
</header>

<section class="hero hero-gallery">
  <div class="hero-inner">
    <div class="hero-kicker">Galerie · ${total} ${total === 1 ? 'hymnus' : (total >= 2 && total <= 4 ? 'hymny' : 'hymen')}</div>
    <h1>Hymny<br>posádek</h1>
    <div class="hero-sub">M Á J O V Á&nbsp;&nbsp;R E G A T A&nbsp;&nbsp;2 0 2 6</div>
    <p class="hero-tagline">
      Každá posádka, jeden kus. Klikni a pusť si hymnus.
    </p>
    <a href="/" class="btn-outline">Vytvořit vlastní</a>
  </div>
</section>

<section class="section">
  <span class="section-num">01</span>
  <div class="section-inner">
    ${empty || `<div class="section-kicker">Všechny posádky</div>
    <h2 style="margin-bottom:48px">Playlist<br>2026</h2>
    <div class="hymn-grid">${cards}</div>`}
  </div>
</section>

<footer>
  <div class="small">Projekt fanoušků <a href="https://www.majovaregata.cz" target="_blank">Májové regaty</a></div>
  <div class="small" style="opacity:.7">Powered by Google Gemini · Lyria 3</div>
</footer>
</body>
</html>`;
}

// ==================== 404 ====================
export function renderNotFound(baseUrl){
  return `<!DOCTYPE html>
<html lang="cs"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Hymnus nenalezen · Májová Regata 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head><body>
<section class="hero">
  <div class="hero-inner">
    <div class="hero-kicker">404</div>
    <h1>Ztraceno<br>v moři</h1>
    <p class="hero-tagline">Tenhle hymnus jsme v palubním deníku nenašli.</p>
    <a href="/hymny" class="btn-outline" style="margin:8px">Galerie</a>
    <a href="/" class="btn-outline" style="margin:8px">Domů</a>
  </div>
</section>
</body></html>`;
}
