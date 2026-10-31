// The soundtrack, written the way a tracker musician would: one string of
// rows per voice, in sidicio's song format (see lib/sidicio/README.md), plus
// the drum letters K S H for kick, snare and hi-hat.
//
// Drums share voice 3 with the arpeggiated chords, as on many C64 tunes: the
// chord rings until the next drum hit cuts it.

import { TRI, SAW, PULSE, NOISE, compileSong } from '../../lib/sidicio/src/index.js';

const INSTRUMENTS = {
  bass: { wave: PULSE, adsr: [0, 8, 9, 2], pw: 0x300, pwSpeed: 20, pwMin: 0x200, pwMax: 0x900, filter: true },
  bassPluck: { wave: SAW, adsr: [0, 7, 4, 1], filter: true },
  lead: {
    wave: PULSE, adsr: [1, 9, 10, 6], pw: 0x500, pwSpeed: 12, pwMin: 0x300, pwMax: 0xb00,
    vib: [10, 0.22, 0.6], glide: 4,
  },
  leadSaw: { wave: SAW, adsr: [0, 9, 9, 5], vib: [8, 0.18, 0.7], glide: 3 },
  bell: { wave: TRI, adsr: [0, 10, 0, 10], vib: [16, 0.12, 0.5] },
  arpMin: { wave: PULSE, adsr: [0, 7, 7, 3], pw: 0x600, pwSpeed: 8, pwMin: 0x400, pwMax: 0x900, arp: [0, 3, 7] },
  arpMaj: { wave: PULSE, adsr: [0, 7, 7, 3], pw: 0x600, pwSpeed: 8, pwMin: 0x400, pwMax: 0x900, arp: [0, 4, 7] },
  padMin: { wave: SAW, adsr: [6, 10, 10, 9], arp: [0, 3, 7, 12], arpSpeed: 3, filter: true },
  padMaj: { wave: SAW, adsr: [6, 10, 10, 9], arp: [0, 4, 7, 12], arpSpeed: 3, filter: true },
  kick: {
    wave: PULSE, adsr: [0, 6, 0, 0], pw: 0x800,
    table: [[NOISE, 84, 1], [PULSE, 52, 1], [PULSE, 46, 1], [PULSE, 41, 1], [PULSE, 37, 1], [PULSE, 34, 1], [TRI, 31, 1]],
  },
  snare: {
    wave: NOISE, adsr: [0, 7, 0, 0], pw: 0x800,
    table: [[NOISE, 88, 1], [PULSE, 58, 1], [NOISE, 82, 1], [NOISE, 80, 1], [NOISE, 79, 1]],
  },
  hat: { wave: NOISE, adsr: [0, 3, 0, 0], table: [[NOISE, 104, 1]] },
};

const DRUMS = { K: 'kick', S: 'snare', H: 'hat' };

// --- composing helpers -----------------------------------------------------------

const rep = (s, n) => Array(n).fill(s).join(' ');

// Octave-jumping eighth-note bass, one bar (16 rows) per root.
function bassEighths(...roots) {
  return roots.map((r) => {
    const [lo, hi] = octaves(r);
    return rep(`${lo} . ${hi} .`, 4);
  }).join(' ');
}

// Galloping bass for the escape theme.
function bassGallop(...roots) {
  return roots.map((r) => {
    const [lo, hi] = octaves(r);
    return rep(`${lo} . ${lo} ${hi}`, 4);
  }).join(' ');
}

// Long bass notes for the title.
function bassSlow(...roots) {
  return roots.map((r) => {
    const [lo, hi] = octaves(r);
    return `${lo} . . . . . . . ${lo} . . . ${hi} . ${lo} .`;
  }).join(' ');
}

// Driving bass for the golem: repeated low roots with an octave kick.
function bassDrive(...roots) {
  return roots.map((r) => {
    const [lo, hi] = octaves(r);
    return rep(`${lo} ${lo} . ${lo} ${hi} . ${lo} .`, 2);
  }).join(' ');
}

function octaves(root) {
  const m = /^([A-G]#?)(\d)$/.exec(root);
  return [`${m[1]}${m[2]}`, `${m[1]}${+m[2] + 1}`];
}

// Drums with chord stabs in between, one bar per chord ("A4m", "F4", ...).
function drumChords(...chords) {
  return chords.map((c) => {
    const minor = c.endsWith('m');
    const root = minor ? c.slice(0, -1) : c;
    const a = `${root}@${minor ? 'arpMin' : 'arpMaj'}`;
    return `K ${a} . . S ${a} . . K ${a} K ${a} S ${a} . H`;
  }).join(' ');
}

// Busier drums for the boss: kicks on the off-beats, a snare roll to close.
function drumDrive(...chords) {
  return chords.map((c) => {
    const minor = c.endsWith('m');
    const root = minor ? c.slice(0, -1) : c;
    const a = `${root}@${minor ? 'arpMin' : 'arpMaj'}`;
    return `K ${a} K . S ${a} . K K ${a} . K S ${a} S H`;
  }).join(' ');
}

function padChords(...chords) {
  return chords.map((c) => {
    const minor = c.endsWith('m');
    const root = minor ? c.slice(0, -1) : c;
    return `${root}@${minor ? 'padMin' : 'padMaj'} ${rep('.', 15)}`;
  }).join(' ');
}

const rest = (bars) => `- ${rep('.', bars * 16 - 1)}`;

// --- the songs -----------------------------------------------------------------

// "Magma": the cave theme. A minor with a Phrygian Bb, 125 BPM.
const magmaA = [
  'A4 . . . . . C5 . B4 . A4 . E5 . . .',
  'F5 . . . E5 . . . C5 . . . A4 . . .',
  'G4 . . . B4 . D5 . G5 . . . F5 . D5 .',
  'E5 . . . . . . . G#4 . B4 . E5 . D5 .',
].join(' ');
const magmaB = [
  'C5 . . . B4 . A4 . E5 . . . . . A5 .',
  'A#4 . . . D5 . F5 . A#5 . . . A5 . F5 .',
  'E5 . . . . . C5 . A4 . . . C5 . E5 .',
  'G#5 . . . . . . . B5~ . . . - . . .',
].join(' ');
const magmaC = [
  'D5 . . . . . . . F5 . . . A5 . . .',
  'G5 . . . F5 . . . E5 . . . D5 . . .',
  'C5 . . . . . A4 . C5 . . . F5 . E5 .',
  'E5 . . . . . . . D5~ . . . E5 . . .',
].join(' ');

const magma = {
  speed: 6,
  filter: { cutoff: 600, resonance: 9, mode: 1, lfo: { min: 250, max: 1100, period: 400 } },
  sections: [
    { v: [bassEighths('A2', 'F2', 'G2', 'E2'), rest(4), drumChords('A4m', 'F4', 'G4', 'E4')] },
    { v: [bassEighths('A2', 'F2', 'G2', 'E2'), `@lead ${magmaA}`, drumChords('A4m', 'F4', 'G4', 'E4')] },
    { v: [bassEighths('A2', 'A#2', 'A2', 'E2'), `@lead ${magmaB}`, drumChords('A4m', 'A#4', 'A4m', 'E4')] },
    { v: [bassEighths('A2', 'F2', 'G2', 'E2'), `@leadSaw ${magmaA}`, drumChords('A4m', 'F4', 'G4', 'E4')] },
    { v: [bassEighths('D2', 'D2', 'F2', 'E2'), `@lead ${magmaC}`, drumChords('D4m', 'D4m', 'F4', 'E4')] },
    { v: [bassEighths('A2', 'A#2', 'A2', 'E2'), `@leadSaw ${magmaB}`, drumChords('A4m', 'A#4', 'A4m', 'E4')] },
  ],
  loop: 1,
};

// "Fuga": the rising-lava theme. E minor, 150 BPM, galloping bass.
const fugaA = [
  'E5 . G5 . B5 . G5 . E5 . F#5 . G5 . A5 .',
  'G5 . . . E5 . . . C5 . E5 . G5 . . .',
  'F#5 . . . D5 . . . A4 . D5 . F#5 . A5 .',
  'B5 . . . . . A5 . G5 . F#5 . D#5 . . .',
].join(' ');
const fugaB = [
  'E5 . . . B4 . . . E5 . . . G5 . . .',
  'F#5 . E5 . D#5 . E5 . B4 . . . . . . .',
  'C6 . B5 . G5 . E5 . C6 . B5 . G5 . E5 .',
  'D#5 . F#5 . B5 . . . A5 . F#5 . D#5 . B4 .',
].join(' ');

const fuga = {
  speed: 5,
  filter: { cutoff: 700, resonance: 11, mode: 1, lfo: { min: 300, max: 1400, period: 160 } },
  sections: [
    { v: [bassGallop('E2', 'C2', 'D2', 'B1'), rest(4), drumChords('E4m', 'C4', 'D4', 'B3')] },
    { v: [bassGallop('E2', 'C2', 'D2', 'B1'), `@lead ${fugaA}`, drumChords('E4m', 'C4', 'D4', 'B3')] },
    { v: [bassGallop('E2', 'E2', 'C2', 'B1'), `@leadSaw ${fugaB}`, drumChords('E4m', 'E4m', 'C4', 'B3')] },
  ],
  loop: 1,
};

// "Vulcano": the title theme. D minor, slow, a bell over a filtered pad.
const titleA = [
  'A4 . . . D5 . . . F5 . . . E5 . D5 .',
  'D5 . . . . . . . C5 . . . A#4 . . .',
  'C5 . . . E5 . . . G5 . . . F5 . E5 .',
  'E5 . . . . . . . C#5 . . . . . . .',
].join(' ');
const titleB = [
  'D5 . F5 . A5 . . . G5 . F5 . E5 . D5 .',
  'F5 . . . D5 . . . A#4 . . . D5 . . .',
  'E5 . . . G5 . . . C6 . . . A#5 . A5 .',
  'A5 . . . . . . . . . . . - . . .',
].join(' ');

const title = {
  speed: 7,
  filter: { cutoff: 500, resonance: 12, mode: 1, lfo: { min: 200, max: 1300, period: 600 } },
  sections: [
    { v: [`@bass ${bassSlow('D2', 'A#1', 'C2', 'A1')}`, rest(4), padChords('D4m', 'A#3', 'C4', 'A3')] },
    { v: [`@bass ${bassSlow('D2', 'A#1', 'C2', 'A1')}`, `@bell ${titleA}`, padChords('D4m', 'A#3', 'C4', 'A3')] },
    { v: [`@bass ${bassSlow('D2', 'A#1', 'C2', 'A1')}`, `@lead ${titleB}`, padChords('D4m', 'A#3', 'C4', 'A3')] },
  ],
  loop: 1,
};

// "Golem": the boss fight. C minor, 150 BPM, i-VI-VII-V with a Phrygian
// Db in the second half for menace; the lead leans on the raised 4th.
const golemA = [
  'C5 . . . D#5 . . . G5 . . . F#5 . G5 .',
  'G#5 . . . G5 . F5 . D#5 . . . C5 . . .',
  'D5 . . . F5 . . . A#5 . . . G#5 . G5 .',
  'G5 . . . . . . . B4 . D5 . F5 . G5 .',
].join(' ');
const golemB = [
  'C6 . A#5 . G5 . D#5 . G5 . . . C6 . . .',
  'C#6 . . . G#5 . . . F5 . . . C#5 . . .',
  'C6 . . . D#6 . . . D6 . C6 . A#5 . G5 .',
  'B5 . . . . . . . D6~ . . . - . . .',
].join(' ');

const golem = {
  speed: 5,
  filter: { cutoff: 500, resonance: 13, mode: 1, lfo: { min: 250, max: 1600, period: 120 } },
  sections: [
    { v: [bassDrive('C2', 'C2', 'C#2', 'G1'), rest(4), drumDrive('C4m', 'C4m', 'C#4', 'G3')] },
    { v: [bassDrive('C2', 'G#1', 'A#1', 'G1'), `@lead ${golemA}`, drumDrive('C4m', 'G#3', 'A#3', 'G3')] },
    { v: [bassDrive('C2', 'C#2', 'C2', 'G1'), `@leadSaw ${golemB}`, drumDrive('C4m', 'C#4', 'C4m', 'G3')] },
    { v: [bassDrive('C2', 'G#1', 'A#1', 'G1'), `@leadSaw ${golemA}`, drumDrive('C4m', 'G#3', 'A#3', 'G3')] },
  ],
  loop: 1,
};

const clear = {
  speed: 4,
  sections: [
    {
      v: [
        '@bassPluck C3 . . . G2 . . . C3 . . . F2 . G2 . C3 . . . . . . . -',
        '@leadSaw C5 E5 G5 C6 . . E6 . D6 . . . B5 . G5 . C6 . . . . . . . -',
        'K C4@arpMaj . . S . . . K F4@arpMaj . . S G4@arpMaj . . K C5@arpMaj . . . . . . . -',
      ],
    },
  ],
  loop: -1,
};

const gameOver = {
  speed: 8,
  sections: [
    {
      v: [
        '@bassPluck A2 . . . F2 . . . E2 . . . A1 . . . . . -',
        '@lead A4 . G4 . F4 . . . E4 . D#4 . E4 . . . . . -',
        '@padMin A3 . . . . . . . @padMaj E3 . . . . . . . . . -',
      ],
    },
  ],
  loop: -1,
};

const victory = {
  speed: 5,
  sections: [
    {
      v: [
        bassEighths('D2', 'A#1', 'C2', 'D2'),
        '@leadSaw D5 . F5 . A5 . D6 . . . C6 . A5 . F5 . A#5 . . . A5 . F5 . D5 . F5 . A#4 . . . C5 . E5 . G5 . C6 . . . A#5 . G5 . E5 . F#5 . . . . . . . . . . . . . . .',
        drumChords('D4m', 'A#3', 'C4', 'D4'),
      ],
    },
    { v: [rest(1), rest(1), rest(1)] },
  ],
  loop: -1,
};

export const SONGS = { title, magma, fuga, golem, clear, gameOver, victory };

// An unnamed voice starts each section with the bass on 1, the lead on 2.
const DEFAULTS = ['bass', 'lead', 'arpMin'];

export function compileSongs() {
  const out = {};
  for (const [name, song] of Object.entries(SONGS)) {
    out[name] = compileSong(song, INSTRUMENTS, { drums: DRUMS, defaults: DEFAULTS, name });
  }
  return out;
}
