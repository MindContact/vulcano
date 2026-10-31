// Vulcano's pixel art, drawn as text and baked once by motorino. Each sprite
// faces right; the renderer mirrors it for the left.
//
// The playable characters are skins only: all share the 10x14 hitbox and
// the 12x16 frame, so the choice never changes what a level asks of you.

import { bake as bakeRows, recolor } from '../../lib/motorino/src/index.js';

const PALETTE = {
  k: '#1b0b0b', // outline
  w: '#dcd6c8', // heat suit
  g: '#8d877c', // suit shade
  v: '#ffab2e', // visor
  V: '#fff2a8', // visor glint
  b: '#5b2e1e', // boots, gloves
  t: '#c2402a', // air tank
  c: '#3b1d16', // slug crust
  C: '#24110d', // slug crust shade
  o: '#ff7a1f', // glowing crack
  y: '#ffd34a', // hot core
  e: '#fff7d0', // eye
  a: '#4a4148', // bat ash
  A: '#2b2329', // bat shade
  r: '#ff4a2a', // bat eye, robot antenna
  m: '#a9bccf', // robot metal
  M: '#62748a', // robot metal shade
  n: '#343c4a', // robot visor, feet
  l: '#5cff8a', // robot LEDs
  s: '#3b2b4e', // spider body
  S: '#6a4f8a', // spider sheen
  L: '#9a78bf', // spider legs
  p: '#5a3a22', // hedgehog spines
  P: '#a2774a', // hedgehog spine tips
  f: '#e6c391', // hedgehog face
  h: '#c98f6a', // hedgehog legs
  q: '#5e4a44', // cooled golem crack
  Q: '#7d6a60', // cooled golem core
  E: '#b8aca4', // cooled golem eye
};

const PLAYER_TOP = [
  '....kkkk....',
  '...kwwwwkk..',
  '..kwwwwwwwk.',
  '..kwwvvvvvk.',
  '..kwwvVVvvk.',
  '..kwwvvvvvk.',
  '...kwwwwwk..',
  '..kkkwwwkkk.',
  '.kttkwwwwgk.',
  '.kttkwwwwgwk',
  '.kttkwwwwgbk',
  '..kkwwwwwkk.',
  '...kwgggwk..',
];

const PLAYER_LEGS = {
  idle: ['...kwk.kwk..', '...kwk.kwk..', '..kbbk.kbbk.'],
  run1: ['..kwk...kwk.', '.kwk....kbk.', '.kbbk.......'],
  run2: ['...kwkkwk...', '....kwwk....', '...kbbbbk...'],
  run3: ['..kwk...kwk.', '..kbk...kwk.', '..kbbk.kbbk.'],
  jump: ['..kwwk.kwwk.', '..kbbk.kbbk.', '............'],
};

const ROBOT_TOP = [
  '......r.....',
  '......k.....',
  '...kkkkkkk..',
  '..kmmmmmmmk.',
  '..kmnnnnnnk.',
  '..kmnllnllk.',
  '..kmmmmmmmk.',
  '...kkkkkkk..',
  '..kMmmmmmMk.',
  '.kMkmllmkMk.',
  '.kMkmmmmkMk.',
  '..kkmmmmkk..',
  '...kMMMMk...',
];

// Seen from the front, so its eight legs show; the legs carry the animation.
const SPIDER_TOP = [
  '............',
  '...kkkkkk...',
  '..kSSssssk..',
  '.kSsssssssk.',
  '.ksssoosssk.',
  '.kssoooossk.',
  '.ksssoosssk.',
  '..kssssssk..',
  '.L.kkkkkk.L.',
  'L.LkssssskL.',
  'L.ksessesk.L',
  'LLkssssssk.L',
  'L.LkkkkkkLLL',
];

const SPIDER_LEGS = {
  idle: ['L..L....L..L', 'L..L....L..L', 'L..L....L..L'],
  run1: ['L...L..L...L', '.L..L..L..L.', '.L...LL...L.'],
  run2: ['.L..L..L..L.', '.L..L..L..L.', 'L..L....L..L'],
  run3: ['L...L..L...L', 'L...L..L...L', '.L..L..L..L.'],
  jump: ['.L.L....L.L.', 'L.L......L.L', '............'],
};

const HEDGEHOG_TOP = [
  '............',
  '............',
  '...p.p......',
  '.p.pPpPp....',
  '..pPPpPPp...',
  'ppPpPPpPPk..',
  '.pPPpPPpPfk.',
  'ppPpPPPpfffk',
  '.pPPpPPffkfk',
  'ppPPPPPfffkk',
  '.pPPPPffff..',
  '..pPPPfffk..',
  '...kffffk...',
];

const recolorLegs = (legs, map) => Object.fromEntries(
  Object.entries(legs).map(([name, rows]) => [name, recolor(rows, map)]),
);

// The order is the order of the options menu.
const CHARACTERS = {
  explorer: { top: PLAYER_TOP, legs: PLAYER_LEGS },
  robot: { top: ROBOT_TOP, legs: recolorLegs(PLAYER_LEGS, { w: 'M', b: 'n' }) },
  spider: { top: SPIDER_TOP, legs: SPIDER_LEGS },
  hedgehog: { top: HEDGEHOG_TOP, legs: recolorLegs(PLAYER_LEGS, { w: 'h', b: 'p' }) },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

const SLUG = [
  ['................', '.....kkkkkk.....', '...kkcococckk...', '..kccccccoccck..', '.kcocccccccceek.', '.kcccoccccccekk.', 'kccccccocccccck.', 'kyyyyyyyyyyyyyk.', '.kkkkkkkkkkkkk..'],
  ['................', '................', '....kkkkkkkk....', '..kkcococcccckk.', '.kcccccoccccceek', 'kcccocccccccceKk', 'kcccccccococccck', 'kyyyyyyyyyyyyyyk', '.kkkkkkkkkkkkkk.'],
];

const BAT = [
  ['k............k', 'ak..........ka', 'aak..kkkk..kaa', '.aakkaaaakkaa.', '..kAarAAraAk..', '...kkaaaakk...', '.....kkkk.....'],
  ['..............', '.....kkkk.....', '....kaaaak....', '.kkkkarAArkkk.', 'kaaaaAAAAaaaak', 'aa.kkaaaakk.aa', 'a....kkkk....a'],
];

// The magma golem, seen from the front. Cooled after a slam, its cracks,
// eyes and core go grey (GOLEM_COOL): the cue that it can be stomped.
const GOLEM = [
  '..........kkkkkkkkkk..........',
  '........kkcccccccccckk........',
  '.......kcccoccccccocccck......',
  '......kcccccccccccccccck......',
  '......kccyyeccccccyyecck......',
  '......kcccyyccccccyyccck......',
  '......kcccccckkkkcccccck......',
  '.......kcccckooookcccck.......',
  '...kkkkkkccccccccccckkkkkk....',
  '..kcccCkkccccoocccccckCccck...',
  '.kcccCCckcccooyoocccckCCccck..',
  '.kccoCCckccoyyyyooccckCCcock..',
  '.kcccCCckcccooyooccccckCCcck..',
  '.kcccCkkkccccooccccccckkCcck..',
  '.kccck..kcccccccccoccck.kccck.',
  '.kcoyk..kccoccccccccck..kyock.',
  '.kkyyk..kcccccccccccck..kyykk.',
  '..kkk...kkcccccocccckk...kkk..',
  '.........kcccckkcccck.........',
  '........kccccck.kcccck........',
  '........kcocck...kccock.......',
  '.......kccccck...kcccck.......',
  '.......kyyyyyk...kyyyyyk......',
  '.......kkkkkkk...kkkkkkk......',
];

const GOLEM_COOL = { o: 'q', y: 'Q', e: 'E' };

const bake = (rows) => bakeRows(rows, PALETTE);

export function buildSprites() {
  const players = {};
  for (const [id, { top, legs }] of Object.entries(CHARACTERS)) {
    players[id] = {};
    for (const [name, rows] of Object.entries(legs)) players[id][name] = bake([...top, ...rows]);
  }
  return {
    players,
    slug: SLUG.map(bake),
    bat: BAT.map(bake),
    golem: bake(GOLEM),
    golemCool: bake(recolor(GOLEM, GOLEM_COOL)),
  };
}
