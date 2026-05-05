// lib/wav-to-mp3.js — server-side konverze WAV → MP3 přes lamejs (čisté JS, bez ffmpeg)
// @breezystack/lamejs je fork s Node.js ESM kompatibilitou (původní lamejs spoléhá na browser globals)
import lamejs from '@breezystack/lamejs';

/**
 * Convert WAV PCM buffer to MP3 buffer.
 * Lyria 3 vrací 44.1 kHz stereo 16-bit PCM WAV.
 * @param {Buffer} wavBuffer
 * @param {number} kbps - default 192
 * @returns {Buffer} MP3 buffer
 */
export function wavBufferToMp3(wavBuffer, kbps = 192){
  const view = new DataView(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength);

  // RIFF / WAVE header check
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (riff !== 'RIFF' || wave !== 'WAVE'){
    throw new Error('Vstup není validní WAV (chybí RIFF/WAVE hlavička).');
  }

  // Walk chunks to find "fmt " and "data"
  let offset = 12;
  let numChannels = 2, sampleRate = 44100, bitsPerSample = 16;
  let dataStart = -1, dataLen = 0;

  while (offset < wavBuffer.length - 8){
    const chunkId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset+1),
      view.getUint8(offset+2), view.getUint8(offset+3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt '){
      // const audioFormat = view.getUint16(offset + 8, true);
      numChannels   = view.getUint16(offset + 10, true);
      sampleRate    = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data'){
      dataStart = offset + 8;
      dataLen = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize & 1); // word-align
  }

  if (dataStart < 0) throw new Error('WAV: nenalezen "data" chunk.');
  if (bitsPerSample !== 16) throw new Error(`WAV: podporujeme pouze 16-bit PCM (vstup má ${bitsPerSample}-bit).`);

  // Extract Int16 samples from data chunk
  const sampleCount = dataLen / 2;
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++){
    samples[i] = view.getInt16(dataStart + i * 2, true);
  }

  const enc = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const blockSize = 1152;
  const chunks = [];

  if (numChannels === 1){
    for (let i = 0; i < samples.length; i += blockSize){
      const block = samples.subarray(i, i + blockSize);
      const out = enc.encodeBuffer(block);
      if (out.length) chunks.push(Buffer.from(out));
    }
  } else {
    // Interleaved → split L/R
    const half = samples.length >> 1;
    const left  = new Int16Array(half);
    const right = new Int16Array(half);
    for (let i = 0; i < half; i++){
      left[i]  = samples[i * 2];
      right[i] = samples[i * 2 + 1];
    }
    for (let i = 0; i < half; i += blockSize){
      const lc = left.subarray(i, i + blockSize);
      const rc = right.subarray(i, i + blockSize);
      const out = enc.encodeBuffer(lc, rc);
      if (out.length) chunks.push(Buffer.from(out));
    }
  }

  const tail = enc.flush();
  if (tail.length) chunks.push(Buffer.from(tail));

  return {
    mp3: Buffer.concat(chunks),
    sampleRate,
    channels: numChannels,
    durationS: (dataLen / 2 / numChannels) / sampleRate
  };
}
