// migrate-from-r2.js — Obnoví záznamy v DB z existujících MP3 v R2 bucketu.
// Použití: node migrate-from-r2.js
// Pozor: lyrics a words budou prázdné, intensity = 'hard', length odhadnuta z velikosti.

import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { insertHymn, getHymnBySlug } from './lib/db.js';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET){
  console.error('[FATAL] Chybí R2 environment proměnné. Ujisti se, že .env je správně nastavený.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

function slugToCrewName(slug){
  // 'pokus-fd24e7' -> 'Pokus'
  // 'kraken-stand-9274c5' -> 'Kraken Stand'
  const parts = slug.split('-');
  // Poslední část je hex suffix (6 znaků hex), zahodíme ji
  if (parts.length > 1 && /^[a-f0-9]{6}$/i.test(parts[parts.length - 1])){
    parts.pop();
  }
  return parts
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

async function main(){
  console.log('🔍 Listing R2 bucket...');
  let token = undefined;
  let allObjects = [];

  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: 'hymns/',
      ContinuationToken: token
    });
    const response = await s3.send(command);
    if (response.Contents){
      allObjects = allObjects.concat(response.Contents);
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);

  console.log(`📦 Found ${allObjects.length} objects in R2.`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const obj of allObjects){
    try {
      const key = obj.Key;
      // Skip directory placeholders
      if (key.endsWith('/')) continue;

      // Extract slug from key: 'hymns/pokus-fd24e7.mp3' -> 'pokus-fd24e7'
      const filename = key.split('/').pop();
      const slug = filename.replace(/\.[^.]+$/, ''); // strip extension

      // Check if already in DB
      const existing = getHymnBySlug(slug);
      if (existing){
        console.log(`  ⏭️  ${slug} — already in DB, skipping`);
        skipped++;
        continue;
      }

      // Reconstruct what we can
      const crewName = slugToCrewName(slug);
      const sizeBytes = obj.Size || 0;
      // Hrubá heuristika: clip ~75 KB, pro ~250+ KB
      const lengthKind = sizeBytes > 150000 ? 'pro' : 'clip';
      const audioUrl = `${R2_PUBLIC_URL}/${key}`;
      const ext = filename.split('.').pop();
      const mimeType = ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`;
      const createdAt = obj.LastModified ? obj.LastModified.getTime() : Date.now();

      insertHymn({
        slug,
        crewName,
        words: '(migrováno z R2 — slova se nezachovala)',
        intensity: 'hard',
        lengthKind,
        lyrics: '⚠️ Text této písně byl ztracen při migraci databáze.\n\nAudio je zachováno a hraje se z původní nahrávky. Pokud si pamatuješ text, klidně si vytvoř novou verzi hymnusu na úvodní stránce.',
        audioUrl,
        audioKey: key,
        mimeType,
        durationS: null,
        createdAt,
        ipHash: null
      });

      console.log(`  ✅ ${slug} (${crewName}) — imported`);
      imported++;
    } catch (err){
      console.error(`  ❌ Error importing ${obj.Key}:`, err.message);
      errors++;
    }
  }

  console.log(`\n📊 Migration complete:`);
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⏭️  Skipped (already in DB): ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\nGalerie: ${process.env.PUBLIC_BASE_URL}/hymny`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});