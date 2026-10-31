// Offline checks: songs compile and bars line up, every song and effect
// renders without NaN or silence, levels parse and are well formed.
// `node tools/check.mjs [--wav DIR]` also writes each song as a WAV.

import { writeFileSync } from 'node:fs';
import { SidChip, MusicPlayer, SfxPlayer } from '../lib/sidicio/src/index.js';
import { SONGS, compileSongs } from '../src/audio/songs.js';
import { SFX } from '../src/audio/sfx.js';

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL', msg); };

const RATE = 48000;
const wavDir = process.argv.includes('--wav') ? process.argv[process.argv.indexOf('--wav') + 1] : null;

function writeWav(path, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
  writeFileSync(path, buf);
}

function stats(name, samples) {
  let peak = 0, sum = 0, nan = false;
  for (const s of samples) { if (!Number.isFinite(s)) nan = true; peak = Math.max(peak, Math.abs(s)); sum += s * s; }
  const rms = Math.sqrt(sum / samples.length);
  if (nan) fail(`${name}: NaN in output`);
  if (rms < 0.01) fail(`${name}: nearly silent (rms ${rms.toFixed(4)})`);
  return `${name.padEnd(12)} peak ${peak.toFixed(2)} rms ${rms.toFixed(3)}`;
}

// --- songs ---
for (const [name, song] of Object.entries(SONGS)) {
  if (song.loop < 0) continue;
  song.sections.forEach((s, i) => {
    const counts = s.v.map((t) => t.trim().split(/\s+/).filter((x) => !x.startsWith('@')).length);
    if (new Set(counts).size > 1) fail(`${name} section ${i}: voice lengths ${counts.join('/')}`);
    if (counts[0] % 16) fail(`${name} section ${i}: ${counts[0]} rows is not whole bars`);
  });
}

const compiled = compileSongs();
for (const [name, song] of Object.entries(compiled)) {
  const chip = new SidChip(RATE);
  const player = new MusicPlayer(chip);
  let ended = false;
  player.onEnd = () => { ended = true; };
  player.play(song);
  const seconds = Math.min(40, (song.rows[0].length * song.speed) / 50 + 2);
  const out = new Float32Array(Math.floor(seconds * RATE));
  let countdown = 0;
  for (let i = 0; i < out.length; i++) {
    if (--countdown <= 0) { countdown += RATE / 50; player.tick(); }
    out[i] = chip.render() * 0.8;
  }
  if (song.loopRow < 0 && !ended) fail(`${name}: jingle did not end`);
  console.log(stats(name, out), `${(song.rows[0].length * song.speed / 50).toFixed(1)}s`);
  if (wavDir) writeWav(`${wavDir}/${name}.wav`, out);
}

// --- effects ---
const sfxOut = [];
for (const name of Object.keys(SFX)) {
  const chip = new SidChip(RATE);
  const player = new SfxPlayer(chip);
  player.defs = SFX;
  player.play(name);
  const out = new Float32Array(RATE);
  let countdown = 0;
  for (let i = 0; i < out.length; i++) {
    if (--countdown <= 0) { countdown += RATE / 50; player.tick(); }
    out[i] = chip.render() * 0.8;
  }
  console.log(stats(`sfx ${name}`, out));
  sfxOut.push(...out.subarray(0, RATE / 2));
}
if (wavDir) writeWav(`${wavDir}/sfx.wav`, sfxOut);

// --- levels ---
try {
  const { LEVELS, parseLevel } = await import('../src/game/levels.js');
  LEVELS.forEach((def, i) => {
    try {
      const lv = parseLevel(def);
      console.log(`level ${i + 1} ${def.name.it.padEnd(20)} ${lv.w}x${lv.h} gems ${lv.gemCount} entities ${lv.spawns.length}`);
    } catch (e) { fail(`level ${i + 1}: ${e.message}`); }
  });
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('ok');
