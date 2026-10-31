// Sound effects as frame programs for the effects SID: one [wave, hz, pw]
// entry per 50 Hz frame (see SfxPlayer in lib/sidicio/src/sfx.js).

import { TRI, SAW, PULSE, NOISE, RETRIGGER, sweep, notes, midiToHz as hz } from '../../lib/sidicio/src/index.js';

export const SFX = {
  jump: { prio: 1, adsr: [0, 6, 0, 0], frames: sweep(PULSE, 190, 620, 9, 0x300) },
  land: { prio: 0, adsr: [0, 2, 0, 0], frames: sweep(NOISE, 700, 300, 3) },
  stomp: {
    prio: 2, adsr: [0, 7, 0, 0],
    frames: [[NOISE, 2400], ...sweep(PULSE, 900, 140, 8, 0x600)],
  },
  gem: { prio: 1, adsr: [0, 8, 0, 6], frames: notes(PULSE, [hz(91), hz(96)], 3, 0x400).concat(notes(TRI, [hz(103)], 6)) },
  life: { prio: 3, adsr: [0, 8, 6, 6], frames: notes(PULSE, [72, 76, 79, 84, 88, 91, 96].map(hz), 3, 0x600) },
  checkpoint: { prio: 3, adsr: [0, 9, 4, 8], frames: notes(SAW | TRI, [60, 64, 67, 72, 76, 79, 84].map(hz), 3) },
  death: {
    prio: 4, adsr: [0, 10, 8, 8],
    frames: [
      ...sweep(NOISE, 3000, 900, 4),
      ...sweep(PULSE, 880, 70, 36, 0x200).map((f, i) => [f[0], f[1] * (1 + 0.06 * Math.sin(i * 1.4)), f[2]]),
    ],
  },
  sizzle: { prio: 4, adsr: [0, 10, 0, 6], frames: sweep(NOISE, 5000, 1200, 30), cutoff: Array.from({ length: 30 }, (_, i) => 1800 - i * 50) },
  geyser: {
    prio: 0, adsr: [6, 8, 8, 9], frames: sweep(NOISE, 600, 2400, 26),
    cutoff: Array.from({ length: 26 }, (_, i) => 300 + i * 50),
  },
  crumble: { prio: 1, adsr: [0, 6, 0, 0], frames: sweep(NOISE, 500, 180, 8) },
  // The golem landing: a low noise thud, filtered so it reads as weight.
  slam: { prio: 3, adsr: [0, 10, 0, 8], frames: sweep(NOISE, 900, 110, 24), cutoff: Array.from({ length: 24 }, (_, i) => 900 - i * 30) },
  bubble: { prio: 0, adsr: [0, 5, 0, 0], frames: sweep(TRI, 160, 520, 5) },
  door: {
    prio: 4, adsr: [0, 10, 10, 10],
    frames: sweep(SAW, 110, 880, 30).map((f, i) => [i % 3 === 0 ? SAW | RETRIGGER : SAW, f[1] * (i % 2 ? 1.5 : 1)]),
  },
  rumble: {
    prio: 2, adsr: [4, 10, 10, 10], frames: sweep(NOISE, 140, 90, 60),
    cutoff: Array.from({ length: 60 }, () => 160),
  },
  select: { prio: 5, adsr: [0, 5, 0, 0], frames: notes(PULSE, [hz(84), hz(91)], 3, 0x400) },
  move: { prio: 5, adsr: [0, 3, 0, 0], frames: notes(PULSE, [hz(79)], 2, 0x400) },
  pause: { prio: 5, adsr: [0, 6, 0, 0], frames: notes(TRI, [hz(84), hz(79), hz(84)], 3) },
  tally: { prio: 1, adsr: [0, 3, 0, 0], frames: notes(PULSE, [hz(96)], 2, 0x200) },
};
